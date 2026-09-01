# Service autosave + live preview transport

Implemented **2026-09-01** on `arena/01a05bbe-final-new-app-templete`.

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

## 1. Stack adaptation (why the snippet is not copied verbatim)

| Snippet | This repo | Why |
| --- | --- | --- |
| `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, …)` | `requireSupabase()` from `src/lib/supabase.ts` | There is no Next.js runtime here (Vite 6 + React 19 + Express). Creating a second client would fork auth/session state; `src/lib/supabase.ts` is the one browser client and already accepts both `VITE_*` and `NEXT_PUBLIC_*` env names. |
| `import debounce from 'lodash/debounce'` | `useDebounce` / `useDebouncedCallback` (`src/hooks/useDebounce.ts`) | lodash is not a dependency and the bundle is size-audited (`docs/dead-code-and-bundle-audit.md`). The React debounce also exposes `flush()`/`cancel()`, which an unmounting step needs. |
| `useState` + `useCallback` + `useEffect` | composes `src/hooks/useAutosave.ts` | The builder already has one debounced autosave with serialized writes, backoff retries, a LocalStorage mirror and `saveNow()`/`retry()`. Re-implementing it would fork that behaviour. |
| `upsert({ ...data, updated_at })` | `upsert(row, { onConflict: 'id,salon_id' })` | `services` is tenant-scoped; the canonical key is `(id, salon_id)` (`services_id_salon_key`). |

The window is unchanged: **800 ms** (`SERVICE_AUTOSAVE_DEBOUNCE_MS`).

## 2. Files

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

## 3. Persistence contract

### Row shape

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

### Update vs insert

- **Update** — when `draft.id` is a UUID the row already exists, so the write is
  `upsert(row, { onConflict: 'id,salon_id' })`.
- **Insert** — disabled by default (`allowInsert: false`). Creating a service
  still goes through `create_saved_service`, which enforces the duplicate,
  category-membership and provenance guards a raw insert cannot express. Pass
  `allowInsert: true` to opt in.

### Tenant safety (two independent locks)

1. **Client** — `resolveAutosaveSalonId()` resolves the salon from the
   authenticated session (`owner_salon_ids()` ← `organization_members`). A
   caller-suggested salon id is accepted **only** if it appears in that
   server-derived list; otherwise the autosave refuses before any SQL is sent
   (`"You do not have access to this salon."`).
2. **Database** — RLS `phase1a_services_member_all`
   (`using`/`with check` on `private.has_salon_role(salon_id)`).

### Provenance is immutable

`theme_id` / `category_id` / `predefined_service_id` are written **only** when a
new row is inserted. An autosave of an existing row never rewrites them, so a
Custom service (NULL provenance) can never be silently re-linked to a predefined
catalog entry.

### Validation mirrors the database

`validateServiceDraft()` rejects, before any request: empty name, negative
price, non-positive duration, negative display order, non-UUID ids. Messages are
the same wording the RPCs raise, so the UI never shows two different errors for
one mistake.

## 4. Live preview communication

Both transports render the **same** `TemplateRenderer`, so they can never drift
visually. `StepFullWebsitePreview` exposes an **Inline ⇄ Isolated** toggle.

### A. Same React tree (default)

The preview is bound directly to the central edit state held by `App.tsx`:

```tsx
<TemplateRenderer data={previewData} mode={mode} renderMode="owner-preview" />
```

Every keystroke re-renders through props — no serialization, no latency. This is
how `PreviewPane` works in steps 2–8.

When the autosave confirms a write, `StepServices` mirrors the confirmed values
back into the central state (`setData`), so the preview reflects the persisted
row rather than a local-only edit.

### B. Inside an iframe

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

## 5. Tests

```bash
npm run test:service-autosave   # 29 checks
npm run test:builder-fixes      # includes the suite above
```

The suite runs the **real** React hook in jsdom against a recording Supabase
stub, so behaviour (debounce coalescing, status transitions, tenant refusal,
row shape, provenance) is asserted at the SQL boundary rather than mocked away.
