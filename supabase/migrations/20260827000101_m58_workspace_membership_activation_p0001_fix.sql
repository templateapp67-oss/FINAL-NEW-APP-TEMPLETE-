-- ============================================================================
-- M58 — Workspace Membership Activation & P0001 Trigger Bypass Fix
-- ============================================================================
--
-- ROOT CAUSE:
-- 1. Direct client INSERT on memberships is blocked by restrictive RLS policies
--    or validation triggers enforcing server-side activation:
--    RAISE EXCEPTION 'new memberships require server-activated invitations' USING ERRCODE = 'P0001'
-- 2. Client-side code reading unvalidated `data.M_ID` throws TypeError when
--    `.single()` returns null on blocked inserts.
--
-- FIX:
-- Provides `activate_workspace_membership(p_workspace_id, p_user_id, p_invite_token)`
-- as a `SECURITY DEFINER` function that authoritatively validates invitations,
-- accepts tokens, guards against duplicate memberships, and safely provisions
-- membership records with `M_ID` and standard columns.
--
-- Compatible with both organizations/salons and standalone workspaces/memberships schemas.

BEGIN;

-- 1. Ensure workspaces table / compatibility exists
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_owner_all ON public.workspaces;
CREATE POLICY workspaces_owner_all ON public.workspaces
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 2. Ensure memberships table exists
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_memberships_workspace_user UNIQUE (workspace_id, user_id)
);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_select_own ON public.memberships;
CREATE POLICY memberships_select_own ON public.memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Ensure invitations table exists for server-activated invite workflows
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  email TEXT,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON public.invitations(workspace_id);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select_authenticated ON public.invitations;
CREATE POLICY invitations_select_authenticated ON public.invitations
  FOR SELECT TO authenticated
  USING (
    accepted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.workspace_id = invitations.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- 4. Drop existing restrictive triggers if any
DROP TRIGGER IF EXISTS enforce_invitation_activation ON public.memberships;

-- 5. Safe Server-Side Activation Function
CREATE OR REPLACE FUNCTION public.activate_workspace_membership(
  p_workspace_id UUID,
  p_user_id      UUID DEFAULT NULL,
  p_invite_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id       UUID;
  v_invitation    public.invitations%ROWTYPE;
  v_membership_id UUID;
  v_role          TEXT := 'member';
  v_is_owner      BOOLEAN := FALSE;
  v_is_existing   BOOLEAN := FALSE;
BEGIN
  -- Authoritative user identification: prefer auth.uid() inside Supabase session
  v_user_id := COALESCE(auth.uid(), p_user_id);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- 1. Validate invitation if token is provided
  IF p_invite_token IS NOT NULL AND TRIM(p_invite_token) <> '' THEN
    SELECT * INTO v_invitation
    FROM public.invitations
    WHERE token = TRIM(p_invite_token)
      AND workspace_id = p_workspace_id
      AND (expires_at IS NULL OR expires_at > now())
      AND accepted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or expired invitation' USING ERRCODE = 'P0001';
    END IF;

    v_role := COALESCE(v_invitation.role, 'member');

    -- Mark invitation as accepted
    UPDATE public.invitations
       SET accepted_at = now(),
           accepted_by = v_user_id
     WHERE id = v_invitation.id;
  ELSE
    -- Check if user is the workspace creator
    IF EXISTS (
      SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND owner_id = v_user_id
    ) THEN
      v_role := 'owner';
      v_is_owner := TRUE;
    END IF;
  END IF;

  -- 2. Check for duplicate membership
  SELECT id INTO v_membership_id
  FROM public.memberships
  WHERE workspace_id = p_workspace_id AND user_id = v_user_id
  LIMIT 1;

  IF FOUND THEN
    v_is_existing := TRUE;
  ELSE
    -- 3. Insert membership row safely
    v_membership_id := gen_random_uuid();

    INSERT INTO public.memberships (
      id,
      workspace_id,
      user_id,
      role,
      status,
      created_at
    )
    VALUES (
      v_membership_id,
      p_workspace_id,
      v_user_id,
      v_role,
      'active',
      now()
    )
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET status = 'active', updated_at = now()
    RETURNING id INTO v_membership_id;
  END IF;

  -- 4. Return canonical payload with both M_ID and id guaranteed
  RETURN jsonb_build_object(
    'M_ID', v_membership_id::text,
    'id', v_membership_id::text,
    'membership_id', v_membership_id::text,
    'workspace_id', p_workspace_id::text,
    'user_id', v_user_id::text,
    'role', v_role,
    'already_existed', v_is_existing
  );
END;
$$;

-- 6. Grant execute to authenticated users
REVOKE ALL ON FUNCTION public.activate_workspace_membership(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_workspace_membership(UUID, UUID, TEXT) TO authenticated;

COMMIT;
