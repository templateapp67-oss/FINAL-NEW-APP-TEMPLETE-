# PR Handoff Prompt

Use the prompt below when handing this repository to the next implementation or review agent.
It records the state merged by [PR #11](https://github.com/templateapp67-oss/FINAL-NEW-APP-TEMPLETE-/pull/11) and points to the repository's detailed handoff documentation.

---

## Copy/paste prompt

You are continuing work in the `templateapp67-oss/FINAL-NEW-APP-TEMPLETE-` repository.

### Start here

1. Read `AGENTS.md` before making changes.
2. Read `docs/HANDOFF.md` for the detailed implementation history and current repository state.
3. Before database work, also read:
   - `docs/database-gaps-analysis.md`
   - `docs/database-migrations-plan.md`
   - `docs/nexora-database-spec.md`
4. Confirm the checked-out branch and run `git status` before editing. Do not overwrite unrelated work.

### Current baseline

- PR #11, **“Finalize: email-confirmation flow + green acceptance suite + cleanup,”** is merged into `main` at merge commit `7a6f4ad53e474eb088857361dcdbda29797ecacd`.
- Its implementation commits are:
  - `a78e832447a87f21b10ec58debddf83fcb4353e5` — complete the email-confirmation flow.
  - `f62c528adf15559edc4fc6a092f2bd9f908aa9f4` — final acceptance-suite and cleanup work.
- The canonical ownership RPC is `owner_salon_ids()`; `nexora_owner_salon_ids()` is a delegating compatibility alias.
- The canonical location source is `public.business_locations`, keyed by `salon_id`.
- Historical migration replay is intentionally limited to the M01–M27 chain through `scripts/lib/migrationFiles.mjs`. Do not replay Design-B migrations over the Design-A test world.
- The unconfigured-Supabase owner-dashboard mock preview is intentional. Tests that require real empty or foreign-tenant behavior use `setSupabaseConfiguredForTests()`.

### What is already complete

- Supabase “Email not confirmed” errors now enter a complete confirmation flow rather than dead-ending:
  - confirmation guidance after signup or blocked sign-in,
  - resend-confirmation support,
  - return-to-login action,
  - successful callback handling.
- Migration validation tolerates the two committed ad-hoc SQL files while keeping historical replay isolated.
- Phase 15 video-gallery accessibility, state hooks, original-platform navigation, and security-test coverage are aligned with runtime behavior.
- Phase 16 and Phase 17 tests are aligned with the actual booking, ownership, mock-preview, migration, and analytics-storage contracts.
- `AGENTS.md` and `docs/HANDOFF.md` contain the corrected architecture and session handoff notes.
- `package-lock.json` is committed for reproducible installs.

Do not reimplement or revert these items unless a new, reproducible defect requires it.

### Verification baseline

The merged work passed all sandbox-runnable suites for phases 2, 8–17.10, including the Phase 17.10 orchestrator, `verify-22-screens.js`, and `git diff --check`. It also passed:

```bash
npm run build
```

The build may emit the existing Vite chunk-size warning; that warning was non-blocking.

Live-database suites such as Phase 3a/3b and M38 reconciliation were not run in the sandbox because they require a real Supabase connection. Do not claim those checks passed without valid credentials and an actual successful run. Never commit credentials or secrets.

### Working rules for the next task

- Keep changes narrowly scoped to the user's request.
- Preserve current database boundaries and migration history. New schema work must be additive and follow the guidance in `AGENTS.md` and the database documents.
- Prefer existing helpers and contracts over parallel implementations.
- Add or update focused regression coverage for behavior changes.
- Run the relevant test scripts, `npm run lint`, and `npm run build` when applicable.
- Report commands that were not run or were blocked, especially checks requiring live services.
- Before handoff, inspect the diff, run `git diff --check`, and ensure `git status` contains no accidental or generated files.
- Commit with a focused conventional message, push only the intended working branch, and prepare a PR summary containing scope, verification results, known limitations, and any required follow-up.

### Required completion report

At the end of the next task, provide:

1. A concise summary of behavior and files changed.
2. The commit hash and pushed branch.
3. Verification commands and results.
4. Any blocked live-service checks or remaining risks.
5. A PR link or PR-ready title/body, as requested.

---

For implementation-level details and the complete project history, treat `docs/HANDOFF.md` as the canonical handoff document rather than duplicating its full contents here.
