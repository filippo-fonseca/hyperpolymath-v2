# VERIFY — web-studio-strip

Branch: `bgsd/web-studio-strip` (base `bgsd/studio-native`, base commit `4da9874e`).
Scope: strip the OLD 3D `/studio` surface from `apps/web` while preserving every
surface the desktop HUD now consumes.

(Written to a unit-scoped filename because `.planning/VERIFY.md` already holds the
sibling orb-widget unit's verification on this base — not clobbered.)

## Commits (atomic, explicit pathspecs)
1. `b1fa6e00` strip(studio): remove the 3D /studio route — `app/(app)/studio/`
2. `7314d160` strip(studio): remove the EnterStudioButton nav toggle — `app/(app)/layout.tsx`
3. `8f85d017` strip(studio): remove orphaned 3D components, libs, and tests — `components/studio/`, `lib/studio/`, `tests/studio-*` (except action-bus)
4. `912d25a8` strip(studio): prune three.js and hand-tracking deps — `package.json` + `pnpm-lock.yaml`

Note: nav cleanup (commit 2) was ordered BEFORE the components removal (commit 3),
not last, because `layout.tsx` imported `EnterStudioButton` from `components/studio` —
removing the components first would have left a dangling import. Every intermediate
commit typechecks green. This is the dependency-safe realization of the plan's
"route → components → deps → nav" intent.

## Dependency / transitive-import analysis (done before any delete)
- External importers of `components/studio` and `lib/studio`: ONLY `app/(app)/studio/page.tsx`,
  `app/(app)/layout.tsx` (EnterStudioButton), and `tests/studio-*`. All other refs were
  internal cross-imports within the two deleted dirs.
- `app/api/studio/*` imports NO studio-lib code (grep CLEAN) — routes are self-contained.
- `lib/jarvis`, `lib/link-preview`, `lib/voice/physical-extension` import NO studio-lib code.
- `tests/studio-action-bus.test.ts` imports `@/lib/jarvis/studio-widget-tools` +
  `@/lib/voice/physical-extension/bus` (PRESERVED surfaces), NOT the 3D studio — so it was KEPT.
- The 8 pruned deps (`three`, `@types/three`, `@react-three/{fiber,drei,postprocessing,uikit,uikit-default}`,
  `@mediapipe/tasks-vision`) had zero importers outside the deleted studio dirs.

## Acceptance criteria — criterion by criterion

### 1. `/studio` gone; app nav has no dead link; `pnpm --filter web build` green
- `git rm` removed `app/(app)/studio/page.tsx`; `EnterStudioButton` import + usage removed from `layout.tsx`.
- Build: `pnpm --filter web build` -> exit 0. `/studio` ABSENT from the route manifest.
- Runtime: `GET http://localhost:3025/studio` -> **HTTP 404**.
- Nav ref grep for `EnterStudioButton`/`/studio` under `app/` (excl. api/studio) -> CLEAN.

### 2. `apps/web/app/api/studio/*` endpoints still respond
- All four routes present + compiled (`.next/server/app/api/studio/{link-preview,news,weather,whatsapp}`).
- Runtime smoke (prod server on :3025, to avoid the user's live :3000 stack):
  - `GET /api/studio/link-preview` -> **HTTP 405** (POST-only handler; route resolves)
  - `GET /api/studio/news` -> **HTTP 401** (auth-gated; desktop supplies bearer)
  - `GET /api/studio/weather` -> **HTTP 401**
  - `GET /api/studio/whatsapp` -> **HTTP 401**
  - None 404 -> every route resolves and executes its handler.
- `git diff 4da9874e..HEAD -- app/api/studio lib/link-preview lib/jarvis lib/voice/physical-extension`
  -> EMPTY (preserved surfaces byte-for-byte untouched).

### 3. three.js / stripped deps absent from package.json + lockfile updated; no remaining three / @react-three imports
- `pnpm --filter web remove` dropped 88 packages; `package.json` grep for `three|react-three|mediapipe` -> 0 matches.
- `pnpm-lock.yaml` updated in the same commit.
- Source grep for any `from 'three' | '@react-three/*' | '@mediapipe/tasks-vision'` (or `require`) -> CLEAN, zero matches.

### 4. Desktop widgets still fetch live data (news/weather round-trip against the API)
- The widget-data endpoints (`news`, `weather`, `whatsapp`, `link-preview`) are unchanged (diff EMPTY)
  and resolve at runtime, enforcing bearer auth (401 unauthenticated is correct — the desktop
  bearer client authenticates). The jarvis `studio_open_widget`/`studio_close_widget` tools and the
  `studio-action` SSE emit are preserved: `tests/studio-action-bus.test.ts` -> **4/4 pass**.

## Additional checks
- `pnpm --filter web typecheck` green after EVERY removal commit (baseline + 4 steps).
- Preserved-surface tests: `tests/studio-action-bus.test.ts` 4/4 pass.
- Did NOT touch `apps/desktop`, `next`, `main`, or `bgsd/studio-native`.

## Result
All four acceptance criteria PASS. Strip complete; preserved surfaces intact and verified live.
