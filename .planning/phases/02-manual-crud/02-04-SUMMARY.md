---
phase: 02-manual-crud
plan: 04
subsystem: ui
tags: [captures, hashtags, tiptap, mention, tsvector, pg_trgm, sheet, nuqs, dnd-kit, sonner, avatar, supabase-auth]

# Dependency graph
requires:
  - phase: 02-01
    provides: AppShell, CommandMenu Cmd+K wiring, CaptureComposerStub slot, sonner toaster, base shadcn primitives (Sheet, Dialog, AlertDialog, Avatar)
  - phase: 02-02
    provides: ProjectMultiSelect data path (projects list with isClass / courseCode), project detail page two-column shell, banner picker convention
  - phase: 02-03
    provides: ProjectDetailColumns (Tasks column already wired), nuqs URL-state pattern, TaskDetailPanel Sheet pattern + dirty-state guards, RelativeTime shared component
provides:
  - captures.content_search tsvector generated column + pg_trgm extension + GIN index (additive migration 0005)
  - 4 captures Server Actions (createCapture, updateCapture, deleteCapture, searchCaptures) with permissive #word extraction
  - 2 hashtags Server Actions (getHashtagsForUser with counts, upsertHashtag with ON CONFLICT race safety)
  - TipTap 3.x CaptureComposer (StarterKit + Mention extension) with #hashtag autocomplete popover
  - Reverse-chronological capture feed with Twitter-style avatar | content rhythm
  - 200px HashtagSidebar with counts, active-filter accent, and an "All" row that clears the tag filter
  - Persistent CaptureSearch bar (200ms debounce, tsvector @@ websearch_to_tsquery)
  - Notion-style CaptureDetailPanel (Sheet, 560px) — canonical edit surface for content + hashtags + project links
  - Cancel + dirty-state guards (discard confirm) shared by Task + Capture detail panels
  - CommandMenu Cmd+K now mounts the real CaptureComposer (Plan 01 stub replaced) — single source-of-truth per D-09
  - Project detail Captures column populated (CAPT-07) — compact CaptureCard mode (no project chips, no avatar)
  - getAuthAvatar() helper — reads Supabase user_metadata for Google profile picture URL + initials fallback
  - dnd-kit SSR id stability fix (regression caught during walkthrough — affects Tasks too)
  - Drizzle postgres client connection-pool fix (singleton on globalThis + max:1) — affects all server-side queries
  - RelativeTime hydration-safe component (regression caught during walkthrough — affects all surfaces showing relative time)
affects: [03-realtime, 05-kiwi]

# Tech tracking
tech-stack:
  added:
    - "@tiptap/react 3.x"
    - "@tiptap/starter-kit 3.x"
    - "@tiptap/extension-mention 3.x"
    - "tippy.js (Mention popover positioning)"
  patterns:
    - "TipTap StarterKit minus block features + Mention extension for chip rendering — canonical pattern for Kiwi's $project + #hashtag chip composer in Phase 5"
    - "Mention.suggestion factory takes a hashtag-list getter (createHashtagSuggestion) — Phase 5 reuses this shape with a project-list getter for $project mentions"
    - "Permissive parse: editor JSON walk extracts text + mention.attrs.label, plus a regex pass over text nodes catches plain #word substrings users typed without invoking the popover (matches the editor + DetailPanel parsers exactly)"
    - "Detail panel Sheet pattern with dirty-state guards: Cancel button, beforeunload guard, discard-confirm AlertDialog on close attempts when dirty — shared by Task + Capture surfaces"
    - "Singleton Drizzle postgres client on globalThis with prepare:false + max:1 — prevents pooler exhaustion under Next dev HMR"
    - "Twitter-style flex avatar | content layout on user-authored cards — avatar fetched once at page-load, threaded via props, never per-card refetch"

key-files:
  created:
    - apps/web/drizzle/0003_captures_search.sql
    - apps/web/supabase/migrations/0005_captures_search.sql
    - apps/web/app/actions/captures.ts
    - apps/web/app/actions/hashtags.ts
    - apps/web/lib/db/queries/captures.ts
    - apps/web/lib/db/queries/hashtags.ts
    - apps/web/components/captures/CaptureComposer.tsx
    - apps/web/components/captures/CaptureCard.tsx
    - apps/web/components/captures/CapturesFeed.tsx
    - apps/web/components/captures/CapturesClient.tsx
    - apps/web/components/captures/CaptureSearch.tsx
    - apps/web/components/captures/CaptureDetailPanel.tsx
    - apps/web/components/captures/HashtagSidebar.tsx
    - apps/web/components/captures/HashtagChip.tsx
    - apps/web/components/captures/tiptap-suggestions.ts
    - apps/web/components/shared/ProjectMultiSelect.tsx
    - apps/web/components/shared/RelativeTime.tsx
    - apps/web/app/(app)/captures/page.tsx
  modified:
    - apps/web/lib/db/schema.ts (captures.contentSearch generated column added)
    - apps/web/lib/db/index.ts (globalThis-cached postgres client, max:1)
    - apps/web/lib/auth/get-user.ts (getAuthAvatar helper added)
    - apps/web/app/globals.css (hashtag-chip-inline + capture-detail-editor styles)
    - apps/web/app/(app)/layout.tsx (NuqsAdapter mount + CommandMenu hashtags wiring)
    - apps/web/components/shell/CommandMenu.tsx (mount CommandMenuContent slot)
    - apps/web/components/shell/CommandMenuContent.tsx (real CaptureComposer replaces stub)
    - apps/web/components/projects/ProjectDetailColumns.tsx (Captures column wired CAPT-07)
    - apps/web/app/(app)/projects/[projectId]/page.tsx (fetch getCapturesForProject)
    - apps/web/components/tasks/KanbanBoard.tsx, TaskList.tsx (dnd-kit explicit DndContext/SortableContext ids)
    - apps/web/components/tasks/TaskDetailPanel.tsx (dirty-state guards mirrored from CaptureDetailPanel)

key-decisions:
  - "TipTap 3.x ProseMirror chip composer (research §Critical Decision Option C) — real Mention nodes, not contenteditable hacks. Phase 5 Kiwi extends this with $project mention nodes alongside #hashtag mention nodes — building it correctly now saves a complete rebuild."
  - "Permissive hashtag extraction: plain `#word` text picked up at save time. Users who type `#idea` without invoking the popover still get the tag. Same extraction logic in CaptureComposer.parseEditor + CaptureDetailPanel.parseEditorJSON — single source of truth keyed on editor JSON walk + regex over text nodes."
  - "CaptureDetailPanel as canonical edit surface (NOT in the original plan — added after walkthrough): user feedback that inline edit can't manage project links AND hashtags AND content in one place. Folded a Notion-style Sheet (560px, slightly wider than TaskDetailPanel's 420px since captures are freeform) and dropped the inline-edit branch from CaptureCard. Hover ⋯ menu → Open / Delete only."
  - "Sheet pattern dirty-state guards: Cancel button + beforeunload guard + discard-confirm AlertDialog. Mirrored from CaptureDetailPanel to TaskDetailPanel for consistency. Esc/click-outside/× all route through the same handleSheetOpenChange dirty check."
  - "HashtagSidebar 'All' row (added post-walkthrough): clicking 'All' clears the active ?tag= filter. Primary affordance for un-filtering — users were getting stuck in a tag view with no obvious exit beyond URL editing. Renders count of total captures."
  - "Drizzle postgres client cached on globalThis with max:1: Next dev HMR was opening new connections per module reload, eventually exhausting Supabase pooler. Singleton + max:1 prevents the storm. Production unaffected (single instance, no HMR), but the pattern is correct everywhere."
  - "Single-user avatar: Twitter-style avatar | content rhythm on CaptureCard, no display name / handle / Twitter chrome. It's Filippo's app, name is redundant noise; just the avatar gives the personal feel. Compact mode (project detail Captures column) deliberately omits the avatar to keep the inline list uncluttered."

patterns-established:
  - "TipTap + Mention extension for chip-style entity insertion — reusable for #hashtag (now), $project (Phase 5 Kiwi), @event (Phase 5 Kiwi)"
  - "Sheet detail panel + dirty-state guards — pattern shared by all editable detail surfaces"
  - "Permissive parse (editor JSON walk + regex over text) — handles both interactive chip insertion AND plain-text typing"
  - "Server-side per-page resource fetch via Promise.all + thread immutable view-model props to client components — no per-card data refetch (avatar, hashtag list, project list all fetched once)"
  - "Compact prop on card components — same component, conditional sub-features (project chips, avatar) keyed off compact={true} for dense inline lists"

requirements-completed:
  - CAPT-01
  - CAPT-02
  - CAPT-03
  - CAPT-04
  - CAPT-05
  - CAPT-06
  - CAPT-07
  - CAPT-08

# Metrics
duration: Multi-session (walkthrough-driven)
completed: 2026-05-11
---

# Phase 2 Plan 04: Captures Domain Summary

**TipTap chip composer + tsvector search + Notion-style detail panel + Twitter-style avatar feed — Captures domain ships with single-source-of-truth composer mounted in both /captures and Cmd+K.**

## Performance

- **Duration:** Multi-session (walkthrough-driven — Tasks 1–3 autonomous, Task 4 walkthrough caught 6 follow-up regressions/UX gaps)
- **Started:** 2026-05-10 (Task 1a — tsvector migration)
- **Completed:** 2026-05-11T14:55Z
- **Tasks:** 4 (planned) + 12 follow-ups (walkthrough)
- **Files modified/created:** 18 production files, 2 migration files
- **Commits:** 16 atomic commits on plan 02-04 (plus this docs commit)

## Accomplishments

- Full Captures CRUD: create, edit, delete, search, filter — all 8 CAPT requirements complete
- TipTap 3.x chip composer with hashtag autocomplete — canonical pattern for Phase 5 Kiwi's $project/@event chips
- Postgres tsvector + pg_trgm full-text search (200ms debounce, combines with hashtag filter)
- Notion-style CaptureDetailPanel (560px Sheet) replaces inline-edit — content + hashtags + project links + timestamps in one place
- Single-source-of-truth composer mounted both at /captures sticky-top AND inside global Cmd+K (Plan 01 stub finally replaced)
- Project detail page Captures column wired (CAPT-07)
- Twitter-style avatar rhythm on feed cards — personal touch, single-user life-OS aesthetic
- Drizzle postgres client connection-pool fix prevents Supabase pooler exhaustion in dev (cross-cutting fix that benefits Tasks too)
- dnd-kit SSR id stability fix prevents aria-describedby hydration mismatch (cross-cutting fix that benefits Tasks too)
- RelativeTime hydration-safe component (cross-cutting — used everywhere "5 min ago" renders)

## Task Commits

Grouped by theme:

### Foundation (Tasks 1a + 1b — schema + Server Actions)

1. **Task 1a: tsvector migration** — `ef066a1` (feat)
2. **Task 1b: captures + hashtags Server Actions + query helpers** — `95dc485` (feat)

### Composer + feed (Task 2 — the chip composer + card components)

3. **Task 2: TipTap CaptureComposer + HashtagChip + CaptureCard + ProjectMultiSelect** — `20fe7a0` (feat)

### Page wiring + Cmd+K + project Captures column (Task 3)

4. **Task 3: /captures page + CommandMenu slot + project Captures column** — `7410e99` (feat)
5. **Composer hashtag extraction fix** — `500a7d9` (fix) — sidebar showed empty because composer wasn't extracting plain `#word` from text; added the permissive parse

### Notion-style detail panel (Task 4 — folded in post-walkthrough)

6. **CaptureDetailPanel — Notion-style Sheet for editing captures** — `18b60af` (feat)
7. **Wire CaptureDetailPanel into feed** — `a0bcee9` (feat) — click card opens canonical edit surface
8. **CaptureDetailPanel — Cancel + dirty-state guards** — `327b333` (feat)
9. **TaskDetailPanel — mirror Cancel + dirty-state guards** — `b200c82` (feat) — pattern parity across both detail panels

### Regression patches surfaced during Task 4 walkthrough

10. **dnd-kit SSR id stability** — `cf2637e` (fix) — explicit `id` prop on every DndContext + SortableContext prevents aria-describedby hydration mismatch (affected Tasks page too)
11. **Hydration-safe relative time** — `4f07851` (fix) — extracted shared RelativeTime that renders the same string server + client
12. **Drizzle connection-pool fix** — `d3d3bf3` (fix) — cache postgres client on globalThis, cap max:1 to stop Supabase pooler exhaustion under HMR
13. **CaptureDetailPanel dirty state on content edits** — `ac84831` (fix) — mirror editor JSON into React state via onUpdate so Save enables on text-only/hashtag-only edits

### UX polish (walkthrough findings)

14. **Hashtag autocomplete arrow keys + mouse click** — `25e5e57` (fix) — was Enter-only, now mouse + ↑↓ navigation work
15. **Hashtag sidebar "All" row** — `ff7d90c` (feat) — clears active tag filter, primary affordance for un-filtering
16. **Twitter-style user avatar on capture cards** — `d921197` (feat) — `getAuthAvatar()` helper + plumbing through CapturesClient → Feed → Card + DetailPanel header

**Plan metadata:** _this commit_ (docs: complete 02-04 plan)

## Files Created/Modified

### Created

- `apps/web/drizzle/0003_captures_search.sql` — drizzle-generated migration for tsvector column
- `apps/web/supabase/migrations/0005_captures_search.sql` — Supabase CLI-compatible variant (pg_trgm extension + generated column + GIN index)
- `apps/web/app/actions/captures.ts` — createCapture / updateCapture / deleteCapture / searchCaptures
- `apps/web/app/actions/hashtags.ts` — getHashtagsForUser (with counts) / upsertHashtag (ON CONFLICT race-safe)
- `apps/web/lib/db/queries/captures.ts` — getCapturesForUser / getCapturesForProject / getCaptureCountForUser
- `apps/web/lib/db/queries/hashtags.ts` — getHashtagSuggestions for composer popover
- `apps/web/components/captures/CaptureComposer.tsx` — TipTap StarterKit + Mention, permissive parser
- `apps/web/components/captures/CaptureCard.tsx` — feed card with avatar | content row + ⋯ menu + delete confirm
- `apps/web/components/captures/CapturesFeed.tsx` — reverse-chronological feed + empty states
- `apps/web/components/captures/CapturesClient.tsx` — client orchestrator: filter composition + detail panel state
- `apps/web/components/captures/CaptureSearch.tsx` — debounced search with searchCaptures action
- `apps/web/components/captures/CaptureDetailPanel.tsx` — Notion-style Sheet, canonical edit surface
- `apps/web/components/captures/HashtagSidebar.tsx` — 200px sidebar with counts, active accent, All row
- `apps/web/components/captures/HashtagChip.tsx` — inline chip rendering (asButton variant for sidebar)
- `apps/web/components/captures/tiptap-suggestions.ts` — Mention.suggestion factory for hashtag popover
- `apps/web/components/shared/ProjectMultiSelect.tsx` — reusable for any project-link multi-select
- `apps/web/components/shared/RelativeTime.tsx` — hydration-safe "5 min ago" rendering
- `apps/web/app/(app)/captures/page.tsx` — Server Component shell + CapturesClient island

### Modified

- `apps/web/lib/db/schema.ts` — captures.contentSearch tsvector generated column added
- `apps/web/lib/db/index.ts` — globalThis-cached postgres client, max:1, prepare:false
- `apps/web/lib/auth/get-user.ts` — getAuthAvatar helper reads Supabase user_metadata.avatar_url/picture + initials fallback
- `apps/web/app/globals.css` — `.hashtag-chip-inline` + `.capture-detail-editor` styles
- `apps/web/app/(app)/layout.tsx` — fetch hashtags + projects for Cmd+K composer; NuqsAdapter mount (Plan 03 holdover)
- `apps/web/components/shell/CommandMenu.tsx` — mount real CommandMenuContent slot
- `apps/web/components/shell/CommandMenuContent.tsx` — real CaptureComposer replaces Plan 01 stub
- `apps/web/components/projects/ProjectDetailColumns.tsx` — Captures column wired with CaptureCard compact mode
- `apps/web/app/(app)/projects/[projectId]/page.tsx` — fetch getCapturesForProject alongside getTasksForProject
- `apps/web/components/tasks/KanbanBoard.tsx` + `TaskList.tsx` — explicit DndContext + SortableContext ids (dnd-kit SSR fix)
- `apps/web/components/tasks/TaskDetailPanel.tsx` — Cancel + dirty-state guards mirrored from CaptureDetailPanel

## Decisions Made

See frontmatter `key-decisions`. The headline calls:

1. **TipTap over contenteditable hacks** — real ProseMirror chips, real Mention extension. Phase 5 Kiwi inherits.
2. **CaptureDetailPanel as canonical edit surface** — not in the original plan; folded in after Task 4 walkthrough revealed inline-edit couldn't handle content + hashtags + project links simultaneously.
3. **Permissive hashtag extraction** — plain `#word` text picked up at save, same logic in composer + detail panel parsers.
4. **Sheet dirty-state guards mirrored to Tasks** — consistency across all detail surfaces, not just captures.
5. **HashtagSidebar "All" row** — added post-walkthrough; primary affordance for clearing tag filter.
6. **Singleton Drizzle client + max:1** — Next HMR was exhausting Supabase pooler; fix benefits all server-side queries.
7. **Twitter-style avatar, no name** — single-user app, the avatar alone is the personal touch; compact mode (project detail) omits it.

## Deviations from Plan

### Scope additions (folded in after walkthrough)

**1. [Rule 2 - Missing Critical] Notion-style CaptureDetailPanel folded into Task 4**
- **Found during:** Task 4 walkthrough
- **Issue:** Original plan had inline-edit on CaptureCard. User feedback: can't edit project links AND hashtags AND content simultaneously. Inline-edit was insufficient for a freeform surface.
- **Fix:** Built `CaptureDetailPanel.tsx` (Notion-style Sheet, 560px) as the canonical edit surface. Dropped inline-edit from CaptureCard — hover ⋯ menu now offers Open / Delete only. CapturesClient owns a single panel instance.
- **Files modified:** `CaptureDetailPanel.tsx` (new), `CaptureCard.tsx` (drop inline-edit branch), `CapturesClient.tsx` (panel state)
- **Verification:** Walkthrough — content edits + hashtag edits + project-link edits all save in one transaction.
- **Committed in:** `18b60af`, `a0bcee9`, `327b333`, `ac84831`

**2. [Rule 2 - Missing Critical] HashtagSidebar "All" row**
- **Found during:** Task 4 walkthrough
- **Issue:** Selecting a hashtag in the sidebar filtered the feed but provided no obvious way to clear the filter (users were editing the URL).
- **Fix:** Added an "All" row at the top of HashtagSidebar that clears `?tag=`. Renders total capture count.
- **Files modified:** `HashtagSidebar.tsx`, `CapturesClient.tsx` (pass totalCount)
- **Committed in:** `ff7d90c`

**3. [Rule 2 - Missing Critical] Twitter-style avatar on capture cards**
- **Found during:** Post-walkthrough request (closeout)
- **Issue:** Feed felt impersonal — a life-OS for one user should feel like the user's own journal, not a generic feed.
- **Fix:** Added `getAuthAvatar()` helper, threaded `userAvatarUrl` + `userInitials` through CapturesClient → CapturesFeed → CaptureCard. Twitter-style flex row in non-compact mode. Detail panel header gets the same avatar (h-10 w-10).
- **Files modified:** `get-user.ts`, `captures/page.tsx`, `CapturesClient.tsx`, `CapturesFeed.tsx`, `CaptureCard.tsx`, `CaptureDetailPanel.tsx`
- **Committed in:** `d921197`

### Regression patches (scoped to this plan since they surfaced during its verification)

**4. [Rule 1 - Bug] dnd-kit SSR id mismatch**
- **Found during:** Task 4 walkthrough (Tasks page also affected)
- **Issue:** `DndContext` and `SortableContext` auto-generated ids server-side that didn't match client-side, triggering aria-describedby hydration warnings.
- **Fix:** Added explicit `id` prop on every DndContext + SortableContext.
- **Files modified:** `KanbanBoard.tsx`, `TaskList.tsx`, `SidebarTree.tsx`
- **Committed in:** `cf2637e`

**5. [Rule 1 - Bug] Hydration mismatch on RelativeTime**
- **Found during:** Task 4 walkthrough
- **Issue:** "5 min ago" computed at SSR using server time differed from client render time.
- **Fix:** Extracted shared `RelativeTime` component that renders a stable label server-side, then hydrates the live label client-side via useEffect.
- **Files modified:** `components/shared/RelativeTime.tsx` (new), all surfaces displaying relative time
- **Committed in:** `4f07851`

**6. [Rule 1 - Bug] Drizzle postgres client connection exhaustion**
- **Found during:** Task 4 walkthrough (Supabase pooler errors)
- **Issue:** Next dev HMR opened new postgres connections per module reload, eventually exhausting the Supabase pooler.
- **Fix:** Cached the postgres client on `globalThis` (singleton) with `max:1` and `prepare:false`. Production unaffected (single instance, no HMR) but pattern is correct everywhere.
- **Files modified:** `apps/web/lib/db/index.ts`
- **Committed in:** `d3d3bf3`

**7. [Rule 1 - Bug] CaptureDetailPanel dirty state stale on text-only edits**
- **Found during:** Task 4 walkthrough
- **Issue:** TipTap's `editor` instance updates internally without triggering React re-render, so the `dirty` check (which reads editor.getJSON()) was stale until something else (e.g. a project-link change) forced a re-render. Save button stayed disabled after content-only edits.
- **Fix:** Mirror parsed editor state into React via `onUpdate` so any keystroke immediately re-evaluates `dirty`.
- **Files modified:** `CaptureDetailPanel.tsx`
- **Committed in:** `ac84831`

**8. [Rule 1 - Bug] Hashtag autocomplete keyboard navigation broken**
- **Found during:** Task 4 walkthrough
- **Issue:** Mention popover responded only to Enter — ↑↓ arrow keys and mouse click didn't select. tippy.js focus management wasn't being passed back to the cmdk list.
- **Fix:** Wired arrow keys + click through the suggestion render handler.
- **Files modified:** `tiptap-suggestions.ts`
- **Committed in:** `25e5e57`

**9. [Rule 1 - Bug] Hashtag sidebar empty after capture submit**
- **Found during:** Task 3 verification
- **Issue:** Composer was only extracting hashtags from mention nodes (popover-confirmed chips). Plain `#word` text the user typed without invoking the popover was discarded.
- **Fix:** Added permissive parse — regex pass over text nodes captures plain `#word` substrings alongside the mention-node walk. Same logic in CaptureDetailPanel.parseEditorJSON.
- **Files modified:** `CaptureComposer.tsx`, later `CaptureDetailPanel.tsx`
- **Committed in:** `500a7d9`

---

**Total deviations:** 9 — 3 scope additions (all Rule 2 missing-critical UX features surfaced by walkthrough) + 6 regression patches (Rule 1 bugs scoped to this plan because they surfaced during its verification; some cross-cut into Tasks/Sidebar code).

**Impact on plan:** All deviations necessary. The detail panel addition is the biggest delta from plan; folded in cleanly because the underlying TipTap editor + parseEditor logic was already reusable. Regression patches are cross-cutting fixes that improve every surface — bundling them with 02-04 keeps the diff history coherent. No scope creep beyond what walkthrough revealed as broken.

## Issues Encountered

- **TipTap.suggestion render typing** — `@tiptap/extension-mention` v3 expects a `render` function returning `{ onStart, onUpdate, onKeyDown, onExit }`; the type signature isn't well-documented. Resolved by following the TipTap v3 examples and wiring tippy.js manually. (Not a bug, just slow.)
- **Server Action validation surface** — `createCapture`/`updateCapture` got Zod schemas after Task 1b RED iteration revealed empty-content captures could be inserted. Added input validation; toast on failure. Documented as decision, not deviation.

## User Setup Required

None — no external service configuration changed. Supabase Auth metadata (Google avatar) is already provisioned by the Plan 01 OAuth flow.

## Next Phase Readiness

- **Wave 4 complete.** All four Phase 2 plans (Areas, Projects, Tasks, Captures) ship with the full Manual CRUD experience.
- **TipTap composer is the canonical pattern for Phase 5 Kiwi** — the same `useEditor` + `Mention.configure` shape will host `$project` and `@event` mention nodes alongside `#hashtag`. `createHashtagSuggestion` factory has a clean shape Kiwi can clone for project/event suggestions.
- **CaptureDetailPanel + TaskDetailPanel share the Sheet dirty-state guards pattern** — any future detail surface (project edit, event edit) should mirror.
- **Drizzle singleton + dnd-kit explicit ids + RelativeTime hydration-safe** — three cross-cutting fixes that all future server-rendered surfaces inherit.
- **No blockers for Phase 3 (Realtime).** Realtime layer will subscribe to `captures`, `hashtags`, `captures_hashtags`, `captures_projects`, `tasks`, `tasks_projects`, `projects`, `areas` — all the tables this plan + earlier plans created.
- **Phase 6 polish backlog (deferred, not blockers):**
  - Empty-state copy could land in the kanban brand-voice banner (per Plan 03 decision)
  - Captures kanban view (not in scope, not requested)
  - Avatar in TaskDetailPanel header (skipped — header is already information-dense; can revisit in Phase 6)

## Self-Check: PASSED

All 14 key files verified on disk (`[ -f ]`). All 16 task commits found via `git log --oneline --all`. Build + typecheck pass.

---
*Phase: 02-manual-crud*
*Completed: 2026-05-11*
