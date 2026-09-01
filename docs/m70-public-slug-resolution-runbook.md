# M70 — public slug resolution repair (live apply runbook)

Fixes the live `https://final-new-app-templete.vercel.app/arts-by-uma`
**“Salon Not Found”**.

## 1. Live audit (read-only, project `qwaehqsmodekbgvnaavz`, 2026-09-01)

Performed with the **anonymous** REST key that the deployed Vercel bundle
uses (confirming the deployment and this audit hit the same project —
`VITE_SUPABASE_URL=https://qwaehqsmodekbgvnaavz.supabase.co` is inlined in
`/assets/index-*.js`).

| Probe | Result |
| --- | --- |
| `POST/GET /rest/v1/rpc/get_public_salon_website?p_slug=arts-by-uma` | `PGRST202` — **function does not exist** |
| `/rest/v1/rpc/get_public_salon_services?p_slug=…` | `PGRST202` — does not exist |
| `/rest/v1/rpc/resolve_public_salon_by_domain?p_host=…` | `PGRST202` — does not exist (M69 not applied) |
| `/rest/v1/rpc/verify_m52_public_resolution_hardening` | `PGRST202` — M52 not applied |
| `select custom_domain from salon_public_websites` | `42703` — column missing (M69 not applied) |
| `select slug,is_published,template_key,salon_id,published_at from salon_public_websites` (as `anon`) | **8 rows returned** — anon has a raw SELECT grant |
| `select config from salon_public_websites` (as `anon`) | full owner config readable, **including `config.email`** |
| `select … from salons` (as `anon`) | `42501` permission denied (correct) |
| `themes` | `barber_mens_grooming`, `hair_studio_color_bar`, `beauty_skin_spa`, `family_full_service`, `nail_lash_studio` — all `is_active = true` |

Website rows actually present:

```
salon-0df31e6cca634d6488a0d1fc2edbc752   published   modern-salon
salon-576adf8448ef4053a8fbf65d0be8e6a4   published   classic
my-salon                                 NOT published  config {}
my-salon-ww8h                            NOT published  config {}
my-salon-1                               NOT published  config {}
my-salon-2                               NOT published  config {}
my-salon-3                               NOT published  config {}
nexora-test-salon-20260831               published   hair_studio_color_bar
```

**Failing condition:** there is **no `arts-by-uma` row at all**. The tenant
websites are still on their provisioning placeholder slugs (`my-salon-N`,
`salon-<uuid>`) and were never published, so every resolver gate that could
have matched the address returns zero rows. Two systemic defects made this
worse: the canonical anonymous RPC (M44/M46/M49/M52/M66/M68) was never applied
— the SPA silently fell back to raw anonymous table reads (leaking every
tenant's `config`, email included) — and the router reported *any* lookup
failure as “Salon Not Found”.

## 2. What M70 does

`supabase/migrations/20260902000101_m70_public_slug_resolution_repair.sql`
(additive, idempotent, one transaction):

1. Creates/redefines the field-limited `public.get_public_salon_website(text)`
   (`security definer`, `search_path = ''`), gated on *published* + *active
   salon* + *not soft-deleted* + *active theme*, granted to `anon` only.
   Column-shape differences between deployments are detected at apply time
   (`salons.deleted_at` / `is_active` / `city`, `business_locations`).
2. `revoke select on public.salon_public_websites from anon` **in the same
   transaction** — closing the owner-config/email exposure. RLS is untouched,
   no policy is dropped, no table is created.
3. Slug canonicalisation that never touches publication state or business
   data: lowercase/trim, replace a *placeholder* slug with the slug derived
   from the salon's real name when free (`Arts By Uma` → `arts-by-uma`), and
   keep `salons.slug` and `salon_public_websites.slug` in agreement.
4. `public.verify_m70_public_slug_resolution(text)` — `service_role`-only
   diagnostic returning one row per resolution gate.

`is_published` / `published_at` are never written: a site stays unpublished
until its owner publishes it.

## 3. Apply

Requires the service-role key (SQL editor or the reviewed runbook). The Arena
sandbox has anonymous access only, so this file is **drafted, not applied**.

```sql
-- Supabase SQL editor, project qwaehqsmodekbgvnaavz
\i supabase/migrations/20260902000101_m70_public_slug_resolution_repair.sql
```

## 4. Verify after apply

```sql
select * from public.verify_m70_public_slug_resolution('arts-by-uma');
select * from public.get_public_salon_website('arts-by-uma');
select slug, is_published from public.salon_public_websites order by slug;
```

Expected: every diagnostic gate `ok = true` **once the owner of “Arts By Uma”
has pressed Publish**. If the business exists but is still a draft, the
diagnostic reports `website is published = false` — that is a product state,
not a bug, and must be fixed by the owner publishing, never by flipping the
flag in SQL.

Anonymous smoke test (no key beyond the public anon key):

```bash
curl "https://qwaehqsmodekbgvnaavz.supabase.co/rest/v1/rpc/get_public_salon_website?p_slug=arts-by-uma&apikey=$ANON"
curl "https://qwaehqsmodekbgvnaavz.supabase.co/rest/v1/salon_public_websites?select=config&apikey=$ANON"  # must now be 42501
```

## 5. Application-side changes shipped with it

* `src/lib/publicSalonResolver.ts` — `canonicalPublicSlug()` (the ONE slug
  normaliser) and `resolvePublicSalonWebsiteResult()` returning
  `found | not-found | unavailable`.
* `src/lib/salonRouting.ts` — `normalizeRouteSlug` delegates to the shared
  normaliser (no second lookup logic).
* `src/main.tsx` — `RootRouter` uses the shared resolver, hands the resolved
  projection to `PublicSalonView` (no duplicate query) and routes a failed
  lookup to `PublicSalonUnavailable` instead of `NotFound`.
* `src/components/PublicSalonUnavailable.tsx` — new “temporarily unavailable”
  screen.
* `vercel.json` — SPA fallback moved from `routes` to `rewrites`; Vercel
  rejects `routes` when `headers` are configured, which was breaking the
  deployment configuration.
* `scripts/test-public-slug-resolution.mjs` — 19 regression checks
  (`npm run test:public-resolution`), including the M70 SQL executed for real
  in PGlite.
