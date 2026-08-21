# Phase 12.5 — Service Discovery (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: enhance the Complete Services directory with discovery controls. No
> hero / trust / featured-services / header / language / dark-mode change; no
> booking-architecture or database-structure change; Phase 10, 11, and 12.1–12.4
> are untouched.

## What was added to the Complete Services directory

| Feature           | Behaviour                                                                  |
|-------------------|----------------------------------------------------------------------------|
| Search            | by service name (EN + हिन्दी), instant, active theme only, no cross-theme  |
| Category filter   | tabs derive from the active theme's own services; instant update           |
| Sort              | Recommended · Name A–Z · Price low→high · Price high→low · Duration short→long (duration long→short retained for continuity) |
| Clear Filters     | restores the complete list; appears while any filter is active             |
| Empty state       | "No services found" + a Clear Filters button; never shows another theme    |
| Theme switch      | search / filter / sort reset automatically; only the new theme's data loads|

## Implementation

- **Name sort** added to the shared `src/lib/serviceSearch.ts` engine
  (`ServiceSort.name_asc`, locale-aware `localeCompare`) — reused by the
  directory, no duplicate sort logic.
- **`src/lib/siteServiceDirectoryI18n.ts`** — new `sortNameAsc` + `clearFilters`
  labels (EN/हिन्दी); empty message tightened to "No services found" /
  "कोई सेवा नहीं मिली".
- **`src/components/SiteServiceDirectory.tsx`**:
  - added the `name_asc` sort option;
  - `Clear Filters` ghost button (themed outline, matches each theme's CTA
    shape) shown whenever search/category/sort are active;
  - empty state shows the message plus a themed solid Clear Filters button;
  - a `useEffect([themeId])` resets search/category/sort on any theme change, so
    a previous theme's query can never leak into the new theme (the renderers
    already remount on theme switch; this hard-guarantees it for any future
    same-instance prop change);
  - controls reflow for mobile (stacked search + sort + clear, wrapping tabs).

## Validation

- `npm run test:phase-12.5` → **83/83 passed**
- `test:phase-12.4` 105/105 · `test:phase-12.3` 74/74 · `test:phase-12.2` 117/117 ·
  `test:phase-12.1` 84/84 · `test:phase-11.8` 450/450
- Phase 10 all green: 10.1 80 · 10.2 49 · 10.3 86 · 10.4 118 · 10.5 56 ·
  10.6 102 · 10.7 66 · 10.8 36 · 10.9 77 · 10.12 178 · 10.13 339
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
