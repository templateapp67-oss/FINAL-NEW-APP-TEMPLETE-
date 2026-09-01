# Service autosave + live preview transport

Implemented **2026-09-01** on `arena/01a05bbe-final-new-app-templete`.

Two patterns are implemented here:

1. **`useAutoSaveService`** — debounced autosave of ONE canonical `services`
   row (section 1, 3).
2. **`useAutoSaveStore`** — a CENTRAL state store that owns its data, updates it
   instantly through `updateField()` and syncs it to the canonical settings row
   after a 600 ms debounce (section 2, 4).

---

## Part 1 — `useAutoSaveService` (service row autosave, 800 ms)

This document records how the requested pattern

```ts
// Next.js App Router + Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
export function useAutoSaveService(serviceData) {
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const saveData = useCallback(debounce(async (data) => {
    setStatus('saving');
    const { error } = await supabase
      .from('services')
      .upsert({ ...data, updated_at: new Date().toISOString() });
    setStatus(error ? 'error' : 'saved');
  }, 800), []);
  useEffect(() => { if (serviceData) saveData(serviceData); }, [serviceData, saveData]);
  return status;
}
```

was implemented in **this** repository, and how the two live-preview transports
are kept in sync.

### 1.1 Stack adaptation (why the snippet is not copied verbatim)

| Snippet | This repo | Why |
| --- | --- | --- |
| `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, …)` | `requireSupabase()` from `src/lib/supabase.ts` | There is no Next.js runtime here (Vite 6 + React 19 + Express). Creating a second client would fork auth/session state; `src/lib/supabase.ts` is the one browser client and already accepts both `VITE_*` and `NEXT_PUBLIC_*` env names. |
| `import debounce from 'lodash/debounce'` | `useDebounce` / `useDebouncedCallback` (`src/hooks/useDebounce.ts`) | lodash is not a dependency and the bundle is size-audited (`docs/dead-code-and-bundle-audit.md`). The React debounce also exposes `flush()`/`cancel()`, which an unmounting step needs. |
| `useState` + `useCallback` + `useEffect` | composes `src/hooks/useAutosave.ts` | The builder already has one debounced autosave with serialized writes, backoff retries, a LocalStorage mirror and `saveNow()`/`retry()`. Re-implementing it would fork that behaviour. |
| `upsert({ ...data, updated_at })` | `upsert(row, { onConflict: 'id,salon_id' })` | `services` is tenant-scoped; the canonical key is `(id, salon_id)` (`services_id_salon_key`). |

The window is unchanged: **800 ms** (`SERVICE_AUTOSAVE_DEBOUNCE_MS`).

### 1.2 Files

| File | Role |
| --- | --- |
| `src/lib/serviceAutosave.ts` | Draft → canonical `services` row mapping, validation, tenant resolution, the upsert itself. |
| `src/hooks/useAutoSaveService.ts` | The hook: `status`, `error`, `lastSavedAt`, `saveNow()`, `retry()`, `flushLocal()`. |
| `src/lib/previewBridge.ts` | `postMessage` protocol + `usePreviewHost` (editor) / `usePreviewClient` (frame). |
| `src/components/LivePreviewFrame.tsx` | The iframe branch (host side). |
| `src/components/PreviewFrameSurface.tsx` | The `/preview-frame` route (child side, read-only renderer). |
| `src/screens/StepServices.tsx` | Editor wiring + autosave status indicator. |
| `src/screens/StepFullWebsitePreview.tsx` | Inline ⇄ Isolated transport toggle. |
| `scripts/test-service-autosave.mjs` | 29 checks: `npm run test:service-autosave` (part of `npm run test:builder-fixes`). |

---

### 1.3 Persistence contract

#### Row shape

Only columns the canonical RPCs write are ever sent:

```
salon_id, name, category, short_description, price_paise, duration_minutes,
is_featured, promotional_badge, display_order, updated_at
(+ id on update)
(+ theme_id, category_id, predefined_service_id, is_active, deleted_at on INSERT)
```

- `price` is **rupees** in the builder and is converted to integer **paise**
  (`Math.round(price * 100)`) at the SQL boundary — never floats.
- `updated_at` is stamped on every write (`new Date().toISOString()`), matching
  the snippet. A database trigger also maintains it (M32).

#### Update vs insert

- **Update** — when `draft.id` is a UUID the row already exists, so the write is
  `upsert(row, { onConflict: 'id,salon_id' })`.
- **Insert** — disabled by default (`allowInsert: false`). Creating a service
  still goes through `create_saved_service`, which enforces the duplicate,
  category-membership and provenance guards a raw insert cannot express. Pass
  `allowInsert: true` to opt in.

#### Tenant safety (two independent locks)

1. **Client** — `resolveAutosaveSalonId()` resolves the salon from the
   authenticated session (`owner_salon_ids()` ← `organization_members`). A
   caller-suggested salon id is accepted **only** if it appears in that
   server-derived list; otherwise the autosave refuses before any SQL is sent
   (`"You do not have access to this salon."`).
2. **Database** — RLS `phase1a_services_member_all`
   (`using`/`with check` on `private.has_salon_role(salon_id)`).

#### Provenance is immutable

`theme_id` / `category_id` / `predefined_service_id` are written **only** when a
new row is inserted. An autosave of an existing row never rewrites them, so a
Custom service (NULL provenance) can never be silently re-linked to a predefined
catalog entry.

#### Validation mirrors the database

`validateServiceDraft()` rejects, before any request: empty name, negative
price, non-positive duration, negative display order, non-UUID ids. Messages are
the same wording the RPCs raise, so the UI never shows two different errors for
one mistake.

## Part 2 — `useAutoSaveStore` (central state, 600 ms)

```ts
const [data, setData] = useState<T>(initialData);
const [status, setStatus] = useState<SaveStatus>('idle');
const supabase = createClientComponentClient();
const debouncedSave = useRef(debounce(async (updatedData: T) => {
  setStatus('saving');
  const { error } = await supabase.from('store_settings')
    .upsert({ id: storeId, ...updatedData, updated_at: new Date().toISOString() });
  setStatus(error ? 'error' : 'saved');
}, 600)).current;
const updateField = useCallback((field, value) => {
  setData((prev) => { const updated = { ...prev, [field]: value };
    setStatus('saving'); debouncedSave(updated); return updated; });
}, [debouncedSave]);
return { data, updateField, status, setData };
```

### 2.1 Adaptation table

| Snippet | This repo | Why |
| --- | --- | --- |
| `createClientComponentClient()` (`@supabase/auth-helpers-nextjs`) | `requireSupabase()` from `src/lib/supabase.ts` | Next.js-only package; not a dependency and would create a second client. |
| `debounce(..., 600)` from lodash | `useDebouncedCallback` (`src/hooks/useDebounce.ts`) | Same reason as pattern 1 — no new dependency, and `flush()`/`cancel()` let a pending save be pushed through on `pagehide`. |
| table `store_settings` | `salon_public_websites` | **No `store_settings` table exists and none may be added** — the Nexora spec forbids duplicate business/settings stores. The canonical per-tenant settings surface is the `config` jsonb on the salon's website row. |
| `id: storeId` | `salon_id`, resolved from the session | Verified against `owner_salon_ids()`; a caller-suggested id is accepted only when the session owns it. |
| `{ ...updatedData }` (one column per setting) | `config` jsonb, **merged**, optionally under a `configKey` namespace | The row holds the whole website draft. Replacing it would delete services/branding/copy; merging is what `saveOwnerWebsiteVisualConfig()` and `POST /api/owner/save-website-visual-config` already do. |
| `updated_at: new Date().toISOString()` | not sent | The column grant is `grant update (slug, template_key, config)` — `updated_at` is not client-writable and is database-maintained. The hook tracks `lastSavedAt` client-side for the status indicator. |

Debounce window: **600 ms** (`STORE_AUTOSAVE_DEBOUNCE_MS`), unchanged.

### 2.2 Files

| File | Role |
| --- | --- |
| `src/lib/storeSettings.ts` | jsonb merge, JSON-safety check, tenant resolution, read + save. |
| `src/lib/autosaveTenant.ts` | ONE shared tenant-resolution implementation for both autosave hooks. |
| `src/hooks/useAutoSaveStore.ts` | The store: `data`, `updateField()`, `setData()`, `hydrate()`, `status`, `saveNow()`, `retry()`. |
| `src/components/dashboard/SettingsPanel.tsx` | Wired: salon booking rules autosave into `config.bookingRules`. |
| `scripts/test-autosave-store.mjs` | 18 checks: `npm run test:autosave-store` (part of `npm run test:builder-fixes`). |

### 2.3 Behaviour

- `updateField(field, value)` updates the central state **instantly** and flips
  `status` to `'saving'` on the keystroke (not 600 ms later), then the debounced
  writer persists it.
- Writes are **serialized** through a promise queue, so a slow request can never
  overwrite a newer one; transient failures retry with backoff.
- `hydrate(next)` loads external state (draft load, another screen editing the
  same slice) **without** scheduling a save — hydration is never an edit.
- `saveNow()` / `retry()` back the explicit “Save Configuration” button.
- `configKey` namespaces the patch (`bookingRules`), so a settings group can
  never clobber `whiteLabel`, `services`, `websiteCopy`, …
- A missing settings row is refused with “Your salon website is not set up yet”
  unless a `slug` is supplied; when supplied, the row is created as a
  **draft** (`is_published = false`, `published_at = null`), which the insert
  policy requires.
- RLS: `phase1a_public_websites_owner_draft_update`
  (`private.can_manage_salon_settings(salon_id)`).

```tsx
const rules = useAutoSaveStore(
  { minNotice: data.bookingRules?.minNotice ?? '1 hour', allowStaffSelection: true },
  { configKey: 'bookingRules' },
);
<input value={rules.data.minNotice} onChange={(e) => {
  rules.updateField('minNotice', e.target.value);      // instant + debounced save
  applyToCentralState({ minNotice: e.target.value });  // live preview follows
}} />
```

---

## Part 3 — Live preview communication

Both transports render the **same** `TemplateRenderer`, so they can never drift
visually. `StepFullWebsitePreview` exposes an **Inline ⇄ Isolated** toggle.

#### A. Same React tree (default)

The preview is bound directly to the central edit state held by `App.tsx`:

```tsx
<TemplateRenderer data={previewData} mode={mode} renderMode="owner-preview" />
```

Every keystroke re-renders through props — no serialization, no latency. This is
how `PreviewPane` works in steps 2–8.

When the autosave confirms a write, `StepServices` mirrors the confirmed values
back into the central state (`setData`), so the preview reflects the persisted
row rather than a local-only edit.

#### B. Inside an iframe

`LivePreviewFrame` streams the same state into the `/preview-frame` document
with `postMessage`. Protocol (`src/lib/previewBridge.ts`):

| Direction | Message | When |
| --- | --- | --- |
| editor → frame | `{ type: 'state', revision, state }` | on every edit, coalesced at 60 ms |
| frame → editor | `{ type: 'ready' }` | on mount (triggers an immediate push) |
| frame → editor | `{ type: 'ack', revision }` | after a state is applied |
| either | `{ type: 'error', message }` | malformed payload |

Security:

- Every message carries the `nexora.preview.v1` protocol marker and is
  type-checked before use.
- **Inbound** messages are dropped unless `event.origin` is in the allow-list
  (this app's origin by default) and — on the host — `event.source` is the frame
  actually rendered.
- **Outbound** messages always pass an explicit `targetOrigin`; `'*'` is never
  used implicitly.
- The frame is a read-only projection: no storage writes, no API calls, no draft
  mutation. `/preview-frame` is matched before salon-slug resolution so a tenant
  can never claim that path.

## Part 4 — Tests

```bash
npm run test:service-autosave   # 29 checks — pattern 1 + both preview transports
npm run test:autosave-store     # 19 checks — pattern 2 (central state store)
npm run test:builder-fixes      # includes both suites above
```

The suite runs the **real** React hook in jsdom against a recording Supabase
stub, so behaviour (debounce coalescing, status transitions, tenant refusal,
row shape, provenance) is asserted at the SQL boundary rather than mocked away.
