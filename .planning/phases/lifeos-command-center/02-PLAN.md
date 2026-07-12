# Life OS command center — implementation plan

1. **Deck/page composition** — reshape the server page and client shells into
   a single operational hierarchy; add the one ambient orb and compose Unit 1
   primitives without changing server props, URLs, auth, or date loading.
2. **Areas system map** — restyle `AreasTree` for the deck, preserve all
   controls/storage names, and gate SVG feed motion plus root pulse with
   `useReducedMotion`.
3. **Widgets and cards** — replace glass-heavy tile treatment with tonal
   panels/hairlines, keep task/habit optimistic behavior and the exact realtime
   query/subscription keys, and make capture conversion accessible.
4. **Responsive/a11y polish** — audit native semantics, focus states, coarse
   pointer behavior, reduced motion, long labels, and narrow/zoomed layouts.
5. **Focused tests** — add lifeos-specific tests for preserved handoff/storage
   contracts, reduced-motion/static behavior, and keyboard/focus affordances;
   run only the relevant existing tests alongside them.
6. **Verification/review** — run Biome on owned files, typecheck, build, and
   targeted tests; inspect the diff for ownership/frozen-contract drift; write
   `verification-report-lifeos.json` with the tested SHA and honest limitations.

## Commit sequence

`UI-SPEC/PLAN` → `page composition` → `AreasTree` → `widgets/cards` →
`a11y/responsive` → `focused tests` → `verification/review`.

## Scope guard

Only the Life OS page/components, `AreasTree`, net-new Life OS tests, this
planning folder, and the root verification report may change. Shared tokens,
shell, tasks, wiki, actions, DB/schema, realtime infrastructure, and shared
spacedrive primitives are read-only for this unit.
