-- Setup Supabase database schema for public salon routes
-- This migration reconciles the user's requested "simple" salons table
-- with the existing Nexora multi-tenant architecture.

BEGIN;

-- 1. Create organizations (tenant root) if missing
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create/Update salons table to match user's requested schema
-- We include organization_id to maintain compatibility with the app's multi-tenant logic.
CREATE TABLE IF NOT EXISTS public.salons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  city TEXT,
  phone TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if the table was already created by another migration
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salons' AND column_name='slug') THEN
    ALTER TABLE public.salons ADD COLUMN slug TEXT UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salons' AND column_name='data') THEN
    ALTER TABLE public.salons ADD COLUMN data JSONB DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salons' AND column_name='is_active') THEN
    ALTER TABLE public.salons ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 3. Create salon_public_websites (required for PublicSalonView.tsx canonical fetch)
CREATE TABLE IF NOT EXISTS public.salon_public_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  template_key TEXT DEFAULT 'hair_studio_color_bar',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update the public_salon_catalog view to include the 'data' column
CREATE OR REPLACE VIEW public.public_salon_catalog
WITH (security_barrier = true)
AS
SELECT s.id, s.name, w.slug, s.address, s.city, s.data
FROM public.salons s
JOIN public.salon_public_websites w ON w.salon_id = s.id
WHERE s.is_active = true AND s.deleted_at IS NULL AND w.is_published = true;

-- 4. Enable RLS and create policies
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_public_websites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.salons;
CREATE POLICY "Allow public read access" ON public.salons FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON public.organizations;
CREATE POLICY "Allow public read access" ON public.organizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON public.salon_public_websites;
CREATE POLICY "Allow public read access" ON public.salon_public_websites FOR SELECT USING (true);

-- 5. Insert default data for Royal Hair & Beauty Studio
DO $$
DECLARE
  v_org_id UUID;
  v_salon_id UUID := 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid;
BEGIN
  -- Try to fetch an existing organization ID first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    SELECT id INTO v_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    
    -- If no organization exists in the table, insert a default one to satisfy FK constraints
    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name)
      VALUES ('Nexora Default Org')
      RETURNING id INTO v_org_id;
    END IF;
  ELSE
    -- If organizations table does not exist, use a fallback UUID
    v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  -- Insert or update the salon record with non-null organization_id
  INSERT INTO public.salons (id, organization_id, slug, name, data)
  VALUES (
    v_salon_id,
    v_org_id,
    'royal-hair-studio',
    'Royal Hair & Beauty Studio',
    '{"name": "Royal Hair & Beauty Studio", "slug": "royal-hair-studio", "templateId": "hair_studio_color_bar"}'::jsonb
  )
  ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    data = EXCLUDED.data,
    organization_id = COALESCE(public.salons.organization_id, EXCLUDED.organization_id)
  RETURNING id INTO v_salon_id;

  -- Ensure a published website record exists if salon_public_websites table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'salon_public_websites') THEN
    INSERT INTO public.salon_public_websites (salon_id, slug, template_key, config, is_published)
    VALUES (
      v_salon_id,
      'royal-hair-studio',
      'hair_studio_color_bar',
      '{"name": "Royal Hair & Beauty Studio", "slug": "royal-hair-studio"}'::jsonb,
      true
    )
    ON CONFLICT (slug) DO UPDATE SET
      is_published = true,
      published_at = NOW();
  END IF;
END $$;

COMMIT;
