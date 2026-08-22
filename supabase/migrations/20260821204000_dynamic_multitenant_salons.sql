-- Migration: 20260821204000_dynamic_multitenant_salons.sql
-- Enables dynamic multi-tenant salon fetching by slug for any user-created salon with RLS

BEGIN;

-- 1. Ensure columns exist for dynamic multi-tenant config
ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Make slug unique if not already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salons_slug_key'
  ) THEN
    ALTER TABLE public.salons ADD CONSTRAINT salons_slug_key UNIQUE (slug);
  END IF;
END $$;

-- 2. Allow anonymous and authenticated users to read any salon dynamically by slug
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public dynamic read" ON public.salons;
DROP POLICY IF EXISTS "Allow public read access" ON public.salons;
CREATE POLICY "Allow public dynamic read" ON public.salons FOR SELECT USING (true);

-- 3. Ensure salon_public_websites (if present) also allows dynamic public read
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'salon_public_websites') THEN
    ALTER TABLE public.salon_public_websites ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow public dynamic read websites" ON public.salon_public_websites;
    CREATE POLICY "Allow public dynamic read websites" ON public.salon_public_websites FOR SELECT USING (true);
  END IF;
END $$;

COMMIT;
