# Tasks operations surface — implementation plan

## Evidence baseline

- Scout map: `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor/.bgsd/runs/sesh-1783863067187/research/tasks-surface-map.md`.
- State boundary: `TasksClient.tsx`; server page stays an SSR hydration shell.
- Existing Unit 1 contracts: `--deck-*`, `--dur-*`, and
  `apps/web/components/spacedrive/` primitives.
- Existing correctness surfaces to preserve: native HTML5 DnD for Kanban,
  Inbox, Overview, and Overdue; dnd-kit PointerSensor + KeyboardSensor for
  List; direct YMD comparisons; all URL/storage/realtime/optimistic paths.

## Work sequence

1. **Header / toolbar / mode strip** — Extract the inline page chrome into a
   clear command toolbar and second-tier mode/filter strip using shared
   primitives. Keep URL view values and filter hydration unchanged.
2. **View composition** — Recompose Inbox, DaySwitcher, Overview, List, and
   Kanban into tonal deck panels with a bounded central board/list scroll
   surface and responsive wrapping. Keep all existing callbacks and DnD pipes.
3. **Rows / cards / selection** — Flatten visual noise, preserve card metadata,
   add focus/touch-visible selection, select-all, drag-handle, and menu states,
   and keep inline edit and reorder semantics.
4. **Inspector** — Restyle the existing Sheet as a metadata pane with shared
   deck vocabulary and responsive width while preserving TipTap, dirty guards,
   save shortcuts, recurrence, project/people links, delete/undo handoff, and
   create mode.
5. **Motion / a11y / responsive sweep** — Gate every owned Motion surface with
   `useReducedMotion`, replace hard-coded durations with `--dur-*` where safe,
   audit focus-visible and coarse-pointer affordances, then check narrow and
   zoomed layouts.
6. **Focused tests** — Add tasks-operations-specific tests for mode/URL
   contracts, YMD/overdue/inbox invariants, expanded storage event behavior,
   and static accessibility/reduced-motion affordance coverage where the
   existing test setup permits.
7. **Verification / review fixes** — Run focused tests, owned-file Biome,
   web typecheck and build; inspect the diff for scope and frozen contracts;
   record limitations honestly in `VERIFICATION.md` and root
   `verification-report-tasks.json`.

## Commit progression

1. `docs(tasks): specify operations surface`
2. `feat(tasks): establish command toolbar and mode strip`
3. `feat(tasks): compose deck views and panels`
4. `feat(tasks): refine task rows cards and selection`
5. `feat(tasks): restyle metadata inspector`
6. `fix(tasks): gate motion and responsive affordances`
7. `test(tasks): cover operations surface contracts`
8. `chore(tasks): record verification evidence`

Every commit uses explicit owned pathspecs. No globals, shell, lifeos, areas,
wiki, actions, DB/schema, realtime, or shared primitive edits are planned.
