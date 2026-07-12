# Life OS Spacedrive UI — Claude Handoff

## Resume location

- Working directory: `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor`
- Staging branch: `next-codex-spacedrive-ui`
- Base commit from `next`: `9b9872674fdc90837e2640e7ed845a926c67434a`
- bgsd session: `sesh-1783863067187` (`Life OS Renaissance`)
- Integration target is this staging branch only. Never modify or merge into `next` or `main`.
- The original `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2` checkout is the live `next` worktree with another agent's changes. Do not work there.

## Final state (updated 2026-07-12, end of Codex leg)

The three-unit graph is complete on `next-codex-spacedrive-ui`:

- Unit 1 shell foundation merged at `16a43f8b`; its worktree and branch were deleted.
- Unit 3 Tasks operations surface merged at `b1760235`; independent review passed with no critical/high/medium findings; its worktree and branch were deleted.
- Unit 2 Life OS command center merged at `db57a65b`; independent review found two medium issues (container breakpoint and semantic headings), both fixed and re-reviewed PASS; its worktree and branch were deleted.
- Combined staging verification: lockfile-pinned install, `pnpm --filter web typecheck`, 27/27 focused integration tests, `git diff --check`, and placeholder-`DATABASE_URL` production build all pass. Existing Wiki `::highlight()` and NFT tracing warnings remain outside this refactor's ownership.
- The user explicitly waived the remaining signed-in browser usage ladder. Responsive, 200% zoom, theme, and authenticated visual checks are therefore recorded as not run rather than fabricated.
- `next` and `main` remain untouched. The only integration target is this staging branch.

See `.planning/phases/life-os-renaissance-integration/VERIFICATION.md`, `verification-report.json`, `verification-report-lifeos.json`, and `verification-report-tasks.json` for evidence.

## Historical pickup state (Claude → Codex)

**Unit 1 (`sd-shell-foundation`) is BUILT and code-verified, pending final merge.**
The Claude leg (Fable Conductor/advisor, Opus executor) implemented it on branch
`bgsd/sd-shell-foundation` in worktree `/Users/filippofonseca/Developer/Projects/hp-wt-sd-shell`
(base `e205d7b6`). ~14 atomic commits: UI-SPEC -> PLAN -> `--deck-*`/`--dur-*`
tokens -> spacedrive primitives (3 commits) -> shell register restyle (3 commits)
-> tests -> post-review fixes -> verification docs. Typecheck, lint, unit tests,
and `pnpm --filter web build` are green; in-unit code review found 0
critical/high/medium. The signed-in Playwright usage pass was IN FLIGHT at
handoff: check `/Users/filippofonseca/Developer/Projects/hp-wt-sd-shell/verification-report.json`.
- If it exists with overall PASS: merge `bgsd/sd-shell-foundation` onto
  `next-codex-spacedrive-ui`, then IMMEDIATELY `git worktree remove --force`
  the worktree AND `git branch -D bgsd/sd-shell-foundation` (teardown policy in
  BGSD.md — merged commits live on the integration branch).
- If absent or FAIL: boot the app (`cd <worktree>/apps/web && pnpm exec next dev -p 3105`),
  run the signed-in usage ladder (console/DOM/vision: nav routes, 260/64px sidebar
  contract + hover overlay, tasks-fullscreen coordination, Cmd+Shift+K palette,
  reduced-motion, 320/768/1440), fix in the unit worktree, then merge + teardown.

**What Unit 1 gives Units 2/3** (all merged onto the integration branch after the
Unit 1 merge; UI-SPEC/PLAN/VERIFICATION live in `.planning/phases/sd-shell-foundation/`):
- `--deck-*` alias tokens in `apps/web/app/globals.css` (app/panel/panel-deep/
  panel-deeper/input/line/divider/hover/selected/active/accent[-faint/-deep]/
  ink[-dull/-faint]) — accent maps to `--hud-cyan` (the wiki-scoped `--sd-accent`
  is NOT lifted to `:root`); plus `--dur-hover 130ms / --dur-select 180ms /
  --dur-tree 170ms / --dur-panel 220ms / --dur-route 260ms / --dur-orb 14s`.
- `apps/web/components/spacedrive/` primitive family via barrel `index.ts`:
  `DeckPanel`, `HairlineDivider`, `SectionHeader`, `EmptyState`, `CommandToolbar`,
  `ModeStrip`, `KpiRail`, `StatChip`, `DenseListRow` (40px, Enter/Space),
  `InspectorShell`/`MetaSection`/`MetaRow`, `AmbientOrb` (12-16s transform/opacity,
  reduced-motion static, ONE per surface). Units 2/3 compose these; do not fork them.
- Shell (Sidebar/AppShell/TopTabBar/PersistentNav) already in the Spacedrive
  register with operational (sans) nav typography; all frozen shell contracts
  preserved and covered by net-new tests in `apps/web/tests/`.

**Deep scout maps for Units 2 and 3** (read them before planning — exact frozen
query keys, storage keys, realtime islands, a11y debt with file anchors):
`.bgsd/runs/sesh-1783863067187/research/lifeos-surface-map.md` and
`.bgsd/runs/sesh-1783863067187/research/tasks-surface-map.md` (also
`shell-surface-map.md`), on disk in this worktree (gitignored, not committed).
Key advisor directives for wave 2: gate `AreasTree`'s SMIL feed dots + avatar
`animate-pulse` behind reduced-motion (currently un-gated); make the captures
hover-only "-> Task" reveal focus-visible; Tasks components import NO
`useReducedMotion` today — add gating throughout; preserve the dual DnD systems
(native HTML5 kanban + dnd-kit list with its keyboard reorder) and the
`fromYmd` local-midnight date invariants.

Codex routing: GPT-5.6 Luna for executors, GPT-5.6 Sol as Conductor/advisor only.
Commit small logical changes frequently. After each unit is verified and merged
onto `next-codex-spacedrive-ui`, immediately remove its worktree AND delete its
unit branch. After Units 2 and 3 merge, run whole-app integration verification
(typecheck/lint/tests/build + accessibility + responsive 320/375/768/1024/1440
+ 200% zoom + reduced-motion + signed-in visual pass).

## Canonical references

The visual reference is **Spacedrive.com**, never Spacetribe. Spacetribe is excluded from rationale, code comments, naming, and implementation.

- `docs/design/spacedrive-references/spacedrive-explorer.png`
- `docs/design/spacedrive-references/spacedrive-overview.png`
- `docs/design/spacedrive-references/spacedrive-orb-hero.png`
- Official Spacedrive primitives: <https://v2.spacedrive.com/react/ui/primitives>
- Raycast interaction direction: <https://www.raycast.com/blog/a-fresh-look-and-feel>
- Wiki Renaissance merge: `d70eac64ca2e23df2f99c514020ee251a72ba9c8`
- PR 253 comment documents the Wiki shipment: Explorer primitives, journal rail, and coherence pass.

North star: a **Renaissance control deck**—Spacedrive's layered dark utility shell and restrained cyan energy; Raycast's speed, focus, keyboard polish, and motion discipline; Hyperpolymath's existing Wiki/Renaissance editorial identity. It must remain a life-management product, not become a file-manager clone.

## Visual decisions already sealed

- Explorer screenshot: layered sidebar / fluid work surface / optional inspector; cool hairlines, tonal depth, two-tier toolbar, restrained cyan.
- Overview screenshot: compact KPI rail before dense but quiet cards; one main metric, one visualization, one metadata cluster.
- Orb screenshot: exactly one ambient energy source per major surface. Never repeat orb badges or copy Spacedrive's asset/gradient.
- Reuse existing semantic tokens and the Wiki `--sd-*` hierarchy through generic aliases. Do not introduce a third raw gray/blue palette.
- Restrict heavy blur/glass to overlays and meaningful layered surfaces. Static cards should not glow on hover.
- Motion: hover 120–140ms; selection 160–200ms; tree 160–180ms; panels 200–240ms; route reveal 240–280ms max; orb 12–16s transform/opacity only. Reduced motion must become static.
- Desktop Life OS target: command deck, KPI rail, 12-column system map / Today work / glance widgets, then capture/activity. Responsive panes become drawers/sheets rather than squeezed columns.
- Tasks target: first-tier command toolbar, second-tier mode strip, dense 40px list rows, restrained Kanban, responsive persistent/overlay inspector.
- Sidebar target: preserve 260px / 64px geometry, overlay hover expansion, anchored utilities, unboxed idle rows, tonal active state, clean operational typography.

## Frozen behavior contracts

Preserve all auth/onboarding gates, server data loads, TanStack keys, realtime invalidation, optimistic mutations, rollback/undo, deep links, local-date parsing, session/local storage, and URL state.

Tasks URL state: `view`, `date`, `task`, `create`, `priority`, `status`, `due`, `project`. Preserve last-view, lesno, inbox, card-field, expansion, overdue, and fullscreen persistence. `TasksClient` remains the sole state/mutation boundary; DB queries/schema/actions are out of scope.

Life OS preserves Quick Send's `jarvis-prefill` session handoff to `/today`, all query keys/realtime islands, Areas collapse state, and existing server props.

Sidebar preserves optimistic/realtime area and project trees, ordering, archive undo, collapsed rail, temporary hover expansion, and Tasks fullscreen coordination.

## Accessibility and regression gates

- Fix pointer-only Task cards/list rows, hover-only controls, and drag-only outcomes with semantic keyboard activation and non-drag move alternatives.
- Focus must be more visible than hover. Enter/Space activate, Escape closes panels, and touch must expose actions.
- Reduced motion must stop Areas SVG infinite motion, pulse, progress, collapse, card, panel, and orb animation.
- Verify 320, 375, 768, 1024, and 1440px plus 200% zoom. No clipped primary actions or unreachable fixed panes.
- Test signed-out, onboarding, and authenticated flows; empty/loading/error/long-content states; URL reloads; create/edit/complete/delete+undo; drag plus keyboard alternative; light/dark; reduced motion.
- Run proportionate typecheck, lint, tests, build, and signed-in browser/visual verification. Do not report green without evidence.

## Three-unit execution graph

### Unit 1 — Spacedrive foundation and app shell

Owns `apps/web/app/globals.css`, `apps/web/components/shell/**`, and a new generic `apps/web/components/spacedrive/**` primitive family. Promote reusable Wiki material/motion vocabulary, refactor AppShell/sidebar/navigation responsively, and add focused tests. Do not modify Life OS, Tasks, or Wiki feature components. Merge and delete its worktree before Unit 2/3 start.

### Unit 2 — Life OS command center

Depends on Unit 1. Owns `apps/web/app/(app)/lifeos/page.tsx`, `apps/web/components/lifeos/**`, and `apps/web/components/areas/AreasTree.tsx`. Recompose the command deck, KPI rail, system map/tree, Today work, widgets, capture, insights, orb, responsiveness, keyboard behavior, and reduced motion while preserving all frozen contracts.

### Unit 3 — Tasks operations surface

Depends on Unit 1 and may run parallel with Unit 2. Owns `apps/web/app/(app)/tasks/page.tsx`, `apps/web/components/tasks/**`, and `apps/web/lib/ui/useTasksExpanded.ts`. Refactor toolbar/mode strip, inbox, overview/list/Kanban, selection, and inspector; fix semantic keyboard/touch behavior and responsive layouts while preserving all frozen contracts.

Merge each verified unit onto `next-codex-spacedrive-ui`, then remove its worktree immediately. Run whole-app integration verification after Units 2 and 3 merge. Do not open or merge a `next`/`main` PR without Filippo's explicit instruction.

## Ready-to-paste Codex pickup prompt (wave 2)

> Resume the bgsd Life OS Renaissance UI refactor from `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor` on branch `next-codex-spacedrive-ui`, continuing bgsd session `sesh-1783863067187` with full advisor/planner/executor/reviewer/tester discipline (GPT-5.6 Sol conducts/advises, GPT-5.6 Luna executes). Read `AGENTS.md`, `BGSD.md`, and `docs/design/LIFE_OS_SPACEDRIVE_HANDOFF.md` completely before acting — the "Current state" section describes exactly where the Claude leg stopped. First close out Unit 1: check `/Users/filippofonseca/Developer/Projects/hp-wt-sd-shell/verification-report.json`; on overall PASS merge `bgsd/sd-shell-foundation` onto `next-codex-spacedrive-ui` and immediately delete both the worktree (`git worktree remove --force`) and the branch (`git branch -D`); if the report is absent or FAIL, re-run the signed-in usage ladder on port 3105, fix in that worktree, then merge and tear down. Then run Units 2 (Life OS command center) and 3 (Tasks operations surface) in parallel per the handoff's three-unit graph, composing the merged `--deck-*`/`--dur-*` tokens and `apps/web/components/spacedrive/` primitives rather than forking them, and reading the deep scout maps at `.bgsd/runs/sesh-1783863067187/research/lifeos-surface-map.md` and `tasks-surface-map.md` before planning. Commit small logical changes frequently; merge each verified unit only onto `next-codex-spacedrive-ui`; delete each merged worktree and branch immediately; then run full integration, accessibility, responsive (320/375/768/1024/1440 + 200% zoom), reduced-motion, and signed-in visual verification. Never touch `next`, `main`, or the original checkout. Preserve every frozen data/URL/storage/realtime/optimistic contract listed in the handoff and scout maps. Play the configured completion sound at the terminal session outcome. Begin by confirming branch/worktree state and showing the exact Luna executor routing before fan-out.
