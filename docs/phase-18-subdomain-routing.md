# Phase 18 — Multi-Tenant Subdomain & Custom Domain Routing

A tenant's public website can now be reached three ways with no per-tenant
DNS configuration:

| Style | Example | How it resolves |
|---|---|---|
| Slug path | `https://final-new-app-templete.vercel.app/royal-hair-studio` | first path segment |
| Subdomain | `https://royal-hair-studio.final-new-app-templete.vercel.app` | `Host` header |
| Custom domain | `https://royalhairstudio.in` | `Host` header |

## How it works (Vite SPA, client-side)

This repo is a **Vite + React SPA** (not Next.js). There is no server-side
router; the Express server (`server.ts`) and Vercel both serve the single
`dist/index.html` for every non-asset path, and the client decides what to
render.

1. **Host classification** — `src/lib/tenantHost.ts` splits the request host
   against the platform apex domain (configurable via `VITE_PUBLIC_ROOT_DOMAIN`,
   defaulting to `platform.websiteUrl` in `src/config/brandConfig.ts`):
   - apex (`nexora.site`), system labels (`www`, `app`, `api`, `admin`, …) → no tenant
   - `<subdomain>.<platform>` → tenant subdomain
   - any other host → custom domain
   - `localhost` / IPs / `<name>.localhost` → local-dev aware
2. **Lookup priority** — `src/lib/publicSalonLookup.ts` + `src/main.tsx`:
   subdomain → custom domain → exact slug → name fallback (`royal-hair-studio`
   → “Royal Hair Studio”) → local draft → static seed.
3. **Schema** — `salon_public_websites.subdomain` and
   `salon_public_websites.custom_domain` (migration `M41`).

## Setup checklist

### 1. Apply the M41 migration (Supabase)

Run `supabase/migrations/20260822000401_m41_tenant_subdomains.sql` on the live
project (SQL editor: paste the entire file — first line `BEGIN`, last `COMMIT`),
then confirm:

```sql
select * from public.verify_m41_tenant_subdomains();
```

It adds the two indexed columns, case-insensitive unique indexes, a null-safe
seed backfill (`royal-hair-studio`), and the owner update grant.

### 2. Wildcard DNS

Point every tenant subdomain at the app instance **once**:

- **Vercel:** Project → Settings → Domains → add `*.yourdomain.com` as a
  wildcard domain, then add the DNS record Vercel shows (`CNAME` to
  `cname.vercel-dns.com`). `https://royal-hair-studio.yourdomain.com` then
  resolves automatically.
- **Cloudflare:** add `CNAME *.yourdomain.com → <platform-target>` (proxied or
  grey-clouded as appropriate).
- **Nginx (self-host):** `server_name ~^(?<tenant>.+)\.yourdomain\.com$;` with
  `proxy_set_header Host $host;` and the SPA fallback
  (`try_files $uri /index.html;`).

### 3. Platform root domain (optional)

Set `VITE_PUBLIC_ROOT_DOMAIN` to your apex domain so the host splitter knows
what counts as “platform” vs “custom domain”. If unset it falls back to
`platform.websiteUrl` in `brandConfig.ts`.

### 4. Rewrites / SPA fallback

Already configured in `vercel.json` (negative-lookahead rewrite serving
`index.html` for everything except `api/`, `_next/`, `assets/`) and in
`server.ts` (Express catch-all). No per-tenant rewrite is needed because the
client reads `window.location.hostname` directly.

### 5. Cookie isolation (auth)

Today the Supabase browser client uses `persistSession` with **localStorage**,
which is origin-scoped — a login on `app.yourdomain.com` does **not** carry to
`royal-hair-studio.yourdomain.com` (each origin has its own storage). The
platform dashboard and tenant sites are intentionally separate origins, so this
is usually correct. If you later want *shared* login state across subdomains,
switch the client to cookie storage and set the cookie `Domain` to the root
`.yourdomain.com` (and update Supabase Auth’s Site URL / allowed redirect
origins accordingly). This is a deliberate config change, not done here by
default.

## Local testing

Wildcard subdomains work locally via `*.localhost` with no DNS change:

```bash
npm run dev                 # listens on 0.0.0.0:3000
# open http://royal-hair-studio.localhost:3000
```

`resolveTenantHost` treats `royal-hair-studio.localhost` as the
`royal-hair-studio` tenant.

## Tests

```bash
npm run test:tenant-subdomain   # host classification + offline/static + mocked DB tiers
npm run validate:migrations     # includes the M41 migration-set assertion
```
