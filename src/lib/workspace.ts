/**
 * Safe Workspace & Membership Initialization Module
 *
 * Provides defensive workspace creation and membership activation via
 * SECURITY DEFINER RPCs to avoid direct-insert RLS / trigger rejections (P0001)
 * and prevent runtime undefined property errors (e.g. Cannot read properties of undefined reading 'M_ID').
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  diagnosticError,
  diagnosticFromError,
  logWorkspaceFailure,
  workspaceUserMessage,
  WorkspaceInitializationError,
} from './workspaceDiagnostics';

export interface WorkspaceInitResult {
  ok: boolean;
  workspaceId?: string;
  membershipId?: string; // Always treat M_ID/membershipId as string | undefined, never crash
  role?: string;
  alreadyExisted?: boolean;
  error?: string;
}

export interface MembershipRecord {
  M_ID?: string;
  m_id?: string;
  id?: string;
  membership_id?: string;
  workspace_id?: string;
  user_id?: string;
  role?: string;
  already_existed?: boolean;
}

/**
 * Defensive row extractor that normalizes arrays, null, undefined or single row objects.
 */
export function extractRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    return data.length > 0 && data[0] != null ? data[0] : null;
  }
  if (typeof data === 'object') {
    return data;
  }
  return null;
}

/**
 * Safely extracts the Membership ID (M_ID / id / m_id) from an arbitrary response row.
 * Guarantees no TypeError on null/undefined data.
 */
export function extractMembershipId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const id = row.M_ID ?? row.m_id ?? row.id ?? row.membership_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * Initialize a new workspace and activate the owner/creator membership.
 *
 * Uses the `activate_workspace_membership` RPC to bypass direct-insert RLS rules
 * and satisfy server-side invitation activation policies (P0001).
 * If membership activation fails, rolls back the created workspace to prevent orphaned state.
 */
export async function initializeWorkspace(
  workspaceName: string,
  inviteToken?: string
): Promise<WorkspaceInitResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Database connection is not configured.' };
  }

  const trimmedName = (workspaceName || '').trim();
  if (!trimmedName) {
    return { ok: false, error: 'Workspace name is required.' };
  }

  try {
    // 1. Authoritative Auth Check (guarded)
    const { data: authData, error: userErr } = await supabase.auth.getUser();
    const user = authData?.user;

    if (userErr || !user) {
      return { ok: false, error: 'Please log in to initialize your workspace.' };
    }

    // 2. Create Workspace
    const { data: wsData, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name: trimmedName, owner_id: user.id })
      .select('id')
      .maybeSingle();

    if (wsErr || !wsData?.id) {
      const diag = diagnosticFromError({
        operation: 'workspace.create',
        stage: 'provision',
        error: wsErr || new Error('Failed to create workspace record.'),
        userId: user.id,
        authenticatedUserExists: true,
      });
      logWorkspaceFailure(diag);
      return { ok: false, error: wsErr?.message ?? 'Failed to create workspace.' };
    }

    const createdWorkspaceId = wsData.id;

    // 3. Activate membership via RPC (bypasses RLS, satisfies server-side invitation rule)
    const { data: rpcData, error: memErr } = await supabase
      .rpc('activate_workspace_membership', {
        p_workspace_id: createdWorkspaceId,
        p_user_id: user.id,
        p_invite_token: inviteToken?.trim() || null,
      });

    if (memErr) {
      // Rollback workspace to prevent orphaned tenant record
      try {
        await supabase.from('workspaces').delete().eq('id', createdWorkspaceId);
      } catch (cleanupErr) {
        console.warn('Failed to rollback orphaned workspace:', cleanupErr);
      }

      const diag = diagnosticFromError({
        operation: 'membership.activate',
        stage: 'provision',
        error: memErr,
        userId: user.id,
        authenticatedUserExists: true,
      });
      logWorkspaceFailure(diag);

      if (memErr.code === 'P0001') {
        return {
          ok: false,
          error: memErr.message || 'The workspace invitation is invalid, expired, or requires server activation.',
        };
      }

      return {
        ok: false,
        error: workspaceUserMessage(diag),
      };
    }

    // 4. Safely extract membership data without assuming direct object shape
    const membership = extractRow<MembershipRecord>(rpcData as MembershipRecord | MembershipRecord[] | null);
    const membershipId = extractMembershipId(membership);

    if (!membershipId) {
      // Rollback on invalid / empty response
      try {
        await supabase.from('workspaces').delete().eq('id', createdWorkspaceId);
      } catch (cleanupErr) {
        console.warn('Failed to rollback workspace on empty membership result:', cleanupErr);
      }

      return {
        ok: false,
        error: 'Membership activation completed but returned an invalid membership ID.',
      };
    }

    return {
      ok: true,
      workspaceId: createdWorkspaceId,
      membershipId,
      role: membership?.role || 'owner',
      alreadyExisted: membership?.already_existed === true,
    };
  } catch (err: unknown) {
    const diag = diagnosticFromError({
      operation: 'workspace.initialize',
      stage: 'provision',
      error: err,
      fallbackMessage: 'Unexpected error during workspace initialization.',
    });
    logWorkspaceFailure(diag);
    return { ok: false, error: workspaceUserMessage(diag) };
  }
}

/**
 * Join an existing workspace by activating a membership invitation token.
 */
export async function joinWorkspaceWithInvitation(
  workspaceId: string,
  inviteToken: string
): Promise<WorkspaceInitResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Database connection is not configured.' };
  }

  const cleanWorkspaceId = (workspaceId || '').trim();
  const cleanToken = (inviteToken || '').trim();

  if (!cleanWorkspaceId || !cleanToken) {
    return { ok: false, error: 'Workspace ID and invitation token are required.' };
  }

  try {
    const { data: authData, error: userErr } = await supabase.auth.getUser();
    const user = authData?.user;

    if (userErr || !user) {
      return { ok: false, error: 'Please log in to accept the workspace invitation.' };
    }

    const { data: rpcData, error: memErr } = await supabase
      .rpc('activate_workspace_membership', {
        p_workspace_id: cleanWorkspaceId,
        p_user_id: user.id,
        p_invite_token: cleanToken,
      });

    if (memErr) {
      const diag = diagnosticFromError({
        operation: 'membership.join',
        stage: 'provision',
        error: memErr,
        userId: user.id,
        authenticatedUserExists: true,
      });
      logWorkspaceFailure(diag);
      return {
        ok: false,
        error: memErr.code === 'P0001' ? (memErr.message || 'Invalid or expired invitation token.') : workspaceUserMessage(diag),
      };
    }

    const membership = extractRow<MembershipRecord>(rpcData as MembershipRecord | MembershipRecord[] | null);
    const membershipId = extractMembershipId(membership);

    if (!membershipId) {
      return { ok: false, error: 'Membership activation returned an invalid response.' };
    }

    return {
      ok: true,
      workspaceId: cleanWorkspaceId,
      membershipId,
      role: membership?.role || 'member',
      alreadyExisted: membership?.already_existed === true,
    };
  } catch (err: unknown) {
    const diag = diagnosticFromError({
      operation: 'membership.join',
      stage: 'provision',
      error: err,
    });
    logWorkspaceFailure(diag);
    return { ok: false, error: workspaceUserMessage(diag) };
  }
}
