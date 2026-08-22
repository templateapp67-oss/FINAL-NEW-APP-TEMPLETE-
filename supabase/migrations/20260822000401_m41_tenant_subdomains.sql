-- ============================================================================
-- M41 (Design B) / Multi-tenant subdomain & custom domain routing
-- ============================================================================
-- Adds indexed `subdomain` and `custom_domain` columns to the canonical
-- `salon_public_websites` table so a tenant can be addressed three ways:
--
--   1. Subdomain    — royal-hair-studio.<platform-domain>
--   2. Custom domain — royalhairstudio.in  (wildcard DNS/A-record -> platform)
--   3. Slug path    — <platform-domain>/royal-hair-studio
--
-- Wildcard DNS (`*.<platform-domain>`) is configured at the host provider
-- (Vercel / Cloudflare / Nginx); this migration only stores the tenant's
-- routing keys. The client (`src/lib/tenantHost.ts` +
-- `src/lib/publicSalonLookup.ts`) resolves the tenant from the request Host
-- and falls back to slug-path + name matching + static seed in that order.
--
-- SAFETY
-- ------
-- Idempotent and additive: no DROP, no DELETE, no UPDATE of existing owner
-- rows beyond a null-safe seed backfill. Fails closed when the canonical
-- table is missing (M28/M38 must run first).
--
-- SQL Editor: paste this ENTIRE file (or run via Supabase CLI). First
-- executable line must be BEGIN; last COMMIT.
-- ============================================================================

begin;

do $m41_preflight$
begin
  if to_regclass('public.salon_public_websites') is null then
    raise exception
      'M41 preflight: public.salon_public_websites is missing. Apply M28/M38 first.';
  end if;
end
$m41_preflight$;

-- 1. Add the two routing-key columns (nullable = optional for existing rows).
alter table public.salon_public_websites
  add column if not exists subdomain text,
  add column if not exists custom_domain text;

-- 2. Uniqueness (case-insensitive) so two tenants can never claim the same
--    subdomain or custom domain.
create unique index if not exists spw_subdomain_unique_ci
  on public.salon_public_websites (lower(btrim(subdomain)))
  where subdomain is not null;

create unique index if not exists spw_custom_domain_unique_ci
  on public.salon_public_websites (lower(btrim(custom_domain)))
  where custom_domain is not null;

-- 3. Lookup indexes used by the client router (subdomain/custom_domain eq +
--    is_published = true).
create index if not exists spw_subdomain_lookup_idx
  on public.salon_public_websites (subdomain)
  where subdomain is not null and is_published = true;

create index if not exists spw_custom_domain_lookup_idx
  on public.salon_public_websites (custom_domain)
  where custom_domain is not null and is_published = true;

-- 4. Backfill the seed salon's subdomain from its slug (null-safe; no-op for
--    any other row). Owners set their own keys later via the publish flow.
update public.salon_public_websites
   set subdomain = lower(btrim(slug))
 where slug = 'royal-hair-studio'
   and (subdomain is null or btrim(subdomain) = '');

-- 5. Owners may set their subdomain/custom domain alongside slug/config.
grant update (subdomain, custom_domain)
  on public.salon_public_websites to authenticated;

-- 6. Read-only self-test.
create or replace function public.verify_m41_tenant_subdomains()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'subdomain_column'; ok := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salon_public_websites'
      and column_name = 'subdomain');
    detail := 'salon_public_websites.subdomain';
  return next;

  check_name := 'custom_domain_column'; ok := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salon_public_websites'
      and column_name = 'custom_domain');
    detail := 'salon_public_websites.custom_domain';
  return next;

  check_name := 'subdomain_unique_index'; ok := to_regclass('public.spw_subdomain_unique_ci') is not null;
    detail := 'case-insensitive unique subdomain index';
  return next;

  check_name := 'custom_domain_unique_index'; ok := to_regclass('public.spw_custom_domain_unique_ci') is not null;
    detail := 'case-insensitive unique custom_domain index';
  return next;

  check_name := 'subdomain_backfilled'; ok := exists (
    select 1 from public.salon_public_websites
    where slug = 'royal-hair-studio' and lower(btrim(subdomain)) = 'royal-hair-studio');
    detail := 'seed salon subdomain derives from its slug';
  return next;
end;
$$;

revoke all on function public.verify_m41_tenant_subdomains() from public, anon, authenticated;
grant execute on function public.verify_m41_tenant_subdomains() to authenticated, service_role;

commit;
