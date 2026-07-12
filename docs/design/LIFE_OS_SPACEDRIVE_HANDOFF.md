# Life OS Spacedrive UI — Claude Handoff

## Resume location

- Working directory: `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor`
- Staging branch: `next-codex-spacedrive-ui`
- Base commit from `next`: `9b9872674fdc90837e2640e7ed845a926c67434a`
- bgsd session: `sesh-1783863067187` (`Life OS Renaissance`)
- Integration target is this staging branch only. Never modify or merge into `next` or `main`.
- The original `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2` checkout is the live `next` worktree with another agent's changes. Do not work there.

## Current state

Research and orchestration are complete. No implementation pipeline executor has launched. The staging branch contains only bgsd isolation/model configuration plus this handoff and the pinned visual references. The first implementation unit must begin from this branch.

Codex routing was explicitly set to GPT-5.6 Luna for executors while GPT-5.6 Sol acted only as Conductor/advisor. If resuming under Claude, use bgsd's configured Claude executor mapping and preserve the same separation: the live session conducts/reviews; pipeline agents execute.

Commit small logical changes frequently. After a pipeline unit is verified and merged onto `next-codex-spacedrive-ui`, immediately remove its worktree directory while preserving its branch/commit history.

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

## Ready-to-paste Claude pickup prompt

> Resume the bgsd Life OS Renaissance UI refactor from `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor` on branch `next-codex-spacedrive-ui`. Read `AGENTS.md`, `BGSD.md`, and `docs/design/LIFE_OS_SPACEDRIVE_HANDOFF.md` completely before acting. Continue bgsd session `sesh-1783863067187` using full advisor/planner/executor/reviewer/tester discipline. The only visual source is Spacedrive.com plus the three tracked screenshots under `docs/design/spacedrive-references/`, Raycast, and the existing Wiki Renaissance (`d70eac6`); Spacetribe is explicitly excluded. Execute the three-unit graph in the handoff: foundation/shell first, merge it, immediately delete its worktree, then run Life OS and Tasks in parallel, committing small logical changes frequently. Merge every verified unit only onto `next-codex-spacedrive-ui`, delete each merged pipeline worktree immediately, then run full integration, accessibility, responsive, reduced-motion, and signed-in visual verification. Never touch `next`, `main`, or the original checkout. Preserve every frozen data/URL/storage/realtime/optimistic behavior contract. Play the configured completion sound at terminal session outcome. Begin by confirming the branch/worktree is clean and showing the exact Luna/Claude executor routing before fan-out.
