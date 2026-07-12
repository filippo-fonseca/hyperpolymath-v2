# Fable seed plan — Unit 1: Spacedrive foundation and app shell

Authored by the Fable advisor (Conductor session) for run `sesh-1783863067187`.
This is the AUTHORITATIVE starting plan. Review it, augment where the code
demands, but do not re-derive it from scratch. The full surface map is in the
worktree at `.planning/research/shell-surface-map.md`
(read it — it has exact line anchors); sealed visual decisions live in
`docs/design/LIFE_OS_SPACEDRIVE_HANDOFF.md` (binding).

## Mission

Turn the app shell into the Spacedrive-style Renaissance control deck
foundation: a generic token layer, a reusable `spacedrive/` primitive family,
and a restyled shell (AppShell, Sidebar, PersistentNav, TopTabBar) — so Units
2 (Life OS) and 3 (Tasks) can build on it without touching globals or shell.

**Ownership (hard boundary):** `apps/web/app/globals.css`,
`apps/web/components/shell/**`, NEW `apps/web/components/spacedrive/**`, plus
net-new tests in `apps/web/tests/`. NEVER modify `components/lifeos/**`,
`components/tasks/**`, `components/wiki/**`, `components/areas/**`, any
`app/actions/**`, `lib/realtime/**`, or DB/schema. If a change seems to demand
touching those, stop and escalate instead.

**Visual sources (only these):** Spacedrive.com and the three pinned
screenshots in `docs/design/spacedrive-references/` (explorer, overview,
orb-hero), Raycast's interaction/motion discipline, and the existing Wiki
Renaissance (`d70eac6`). Spacetribe is EXCLUDED — never in code, comments,
naming, or rationale. Never copy Spacedrive's actual assets/gradients; the orb
is our own.

## Step 1 — Token layer in `globals.css` (commit 1)

The Wiki Renaissance already planted the full `--sd-*` ladder (authoritative
dark block at ~L1411; light at ~L1374). Build on it; invent NOTHING raw.

1. Add a **generic alias layer** (name suggestion: `--deck-*`) mapping onto
   the existing `--sd-*` + semantic tokens so feature surfaces stop reaching
   for wiki-named or raw values:
   - Surfaces: `--deck-app` -> `--sd-app`, `--deck-panel` -> `--sd-box`,
     `--deck-panel-deep` -> `--sd-dark-box` / `--sd-darker-box`,
     `--deck-input` -> `--sd-input`.
   - Hairlines: `--deck-line` -> `--sd-line`, `--deck-divider` -> `--sd-divider`.
   - States: `--deck-hover` -> `--sd-hover`, `--deck-selected` -> `--sd-selected`,
     `--deck-active` -> `--sd-active`.
   - Accent: `--deck-accent[-faint/-deep]` -> `--sd-accent*` (which is the
     restrained cyan). Accent stays cyan-only; the multi-accent inks
     (`--ink-amber/-sage/-coral/...`) remain for data semantics, not chrome.
   - Ink: `--deck-ink[-dull/-faint]` -> `--sd-ink*`.
   Define aliases once in `:root` + `.dark` beside the existing sd blocks.
   Do NOT change any existing token's value; light-mode sd values already exist.
2. Add **numeric motion duration tokens** (none exist today — durations are
   inline): `--dur-hover: 130ms; --dur-select: 180ms; --dur-tree: 170ms;
   --dur-panel: 220ms; --dur-route: 260ms; --dur-orb: 14s;` next to the
   existing easings (~L82). These encode the sealed motion budget: hover
   120-140, selection 160-200, tree 160-180, panels 200-240, route 240-280 max,
   orb 12-16s transform/opacity only.
3. **Extend the reduced-motion block** (~L636): it currently covers only
   `.hud-*`/`.receipt-*`/`.wiki-explorer`. Add coverage for all new
   `spacedrive/` primitive classes and the shell (e.g. a `.sd-motion` class
   convention or explicit selectors) so CSS-driven motion in this unit's
   surfaces is fully static under `prefers-reduced-motion`. JS-driven motion
   uses `useReducedMotion` from `motion/react` (established repo pattern).

## Step 2 — `apps/web/components/spacedrive/**` primitive family (commits 2-4)

Net-new directory (confirmed absent) with a barrel `index.ts`. Style ONLY via
the alias/token layer. Wiki components stay untouched — do not import
wiki-specific orchestration; where a Wiki explorer primitive is genuinely
generic (InspectorShell, ExplorerListView row anatomy, EmptyState), build the
generic sibling here informed by its anatomy, thin and token-driven. Keep each
primitive small; split commits by cluster:

- **Panels/chrome:** `DeckPanel` (tonal layered panel, hairline border, NO
  hover glow — heavy blur/glass is reserved for overlays and meaningful
  layered surfaces only), `HairlineDivider`, `SectionHeader` (operational
  typography: sans/mono, no Garamond in chrome), `EmptyState`.
- **Toolbars:** `CommandToolbar` (first tier: identity + primary actions) and
  `ModeStrip` (second tier: view modes/filters) — the two-tier toolbar from
  the explorer screenshot. Compose from real `<button>`s, `aria-pressed` for
  toggles, focus-visible ring via `--ring-focus` MORE visible than hover.
- **Data display:** `KpiRail` + `StatChip` (compact KPI rail from the overview
  screenshot: one main metric, quiet density), `DenseListRow` (40px row
  anatomy: leading glyph, title, trailing meta/pills; keyboard-activatable —
  Enter/Space; focus ring), `InspectorShell` + `MetaSection`/`MetaRow`
  (generic inspector panel shell).
- **Ambient:** `AmbientOrb` — exactly ONE ambient energy source per major
  surface (consumers enforce singularity; document it in the JSDoc). Our own
  gradient (never Spacedrive's asset), 12-16s loop, transform/opacity ONLY,
  `useReducedMotion` -> static frame. Provide `data-testid` for tests.

Every primitive: dark-first but correct in both themes, no console errors,
props typed and minimal, `"use client"` only where interactivity demands.

## Step 3 — Shell restyle (commits 5-7, one file-cluster per commit)

Restyle to the Spacedrive register while preserving behavior EXACTLY:

- `Sidebar.tsx`: unboxed idle rows (no boxed cards at rest), tonal active
  state via `--deck-selected` (adapt `.sidebar-row-active` helpers in
  globals.css), hairline section dividers, restrained cyan only as accent.
  PRESERVE: 260px/64px geometry, collapsed hover-overlay expansion (inner
  panel to 260px, z-50, page never reflows), pin chevron, anchored footer
  utilities (archived-eye, ThemeToggle, SFX, Settings), `sidebar-collapsed` +
  `sidebar-show-archived` storage, areas/projects realtime subscriptions +
  `useOptimistic` split (areas here, projects in SidebarTree), archive undo
  semantics, all context menus and dnd reorder in `SidebarTree.tsx`.
- `AppShell.tsx`: token surfaces; PRESERVE tasks-expanded sidebar collapse
  (200ms -> `--dur-panel`, `useReducedMotion`-gated, `sidebarAnimating`
  overflow guard), split-screen 70/30, `/today` + `/onboarding` panel
  suppression, `/wiki` full-height.
- `TopTabBar.tsx` + `PersistentNav.tsx` + `NavArrows.tsx` + `Breadcrumbs.tsx`:
  hairlines, tonal actives, duration tokens; PRESERVE `top-tab-last-route` /
  `top-tab-today-route` storage, tour `data-tour` attributes, calendar badge.
- `CommandMenu.tsx` / `ShortcutsCheatSheet.tsx`: these are overlays — the ONE
  place heavier glass/blur is allowed. Raycast register: fast, focused,
  keyboard-first. Motion within budget.
- Swap inline durations for the new tokens across shell files as touched.
- Responsive: at 320/375px nothing clipped; collapsed rail still usable;
  hover-expansion does not trap touch users (rail links work on tap without
  requiring hover).

## Step 4 — Tests (commit 8)

Net-new in `apps/web/tests/` (RTL/jsdom patterns per
`studio-tracking-toggle.test.tsx`):
- `spacedrive-primitives.test.tsx`: render smoke for each primitive (both
  themes via `.dark` class), keyboard activation on `DenseListRow`
  (Enter/Space), `aria-pressed` on `ModeStrip` toggles, `AmbientOrb` static
  under mocked reduced-motion.
- `shell-sidebar-contract.test.tsx`: `sidebar-collapsed`/`sidebar-show-archived`
  persistence round-trip; `useTasksExpanded` -> `tasks-expanded` key + the
  `tasks-expanded-change` window event contract.

## Frozen contracts (verify, never alter)

localStorage: `sidebar-collapsed`, `sidebar-show-archived`, per-area collapse
(`useAreaCollapsed`), `top-tab-last-route`, `top-tab-today-route`,
`tasks-expanded` (+ `tasks-expanded-change` event), `split-screen-on`
(+ `split-screen-change`), `hp_tour_pending`/`hp_tour_v1_done`, SFX pref,
theme. Query/realtime: `tableKey("areas"|"projects", userId)`,
`useTableSubscription("areas"|"projects")` refcounted singletons, optimistic
areas/projects split, archive-undo (immediate-commit variant). Events:
`hp:tour-pending`. Global hotkeys: Cmd+K JARVIS, Cmd+Shift+K palette,
Cmd+[/], Ctrl+1/2/3, Ctrl+Alt+C/T/E/P. Deep links `?create=now`.

## Verification bar (no silent green)

`pnpm install` if node_modules missing; `pnpm --filter web typecheck` (or the
repo's script), lint, `pnpm --filter web test`, `pnpm --filter web build` from
the worktree root — all green with evidence. Then signed-in usage
verification on the unit's dev port: navigate all primary nav routes, sidebar
collapse/expand/hover-overlay, tasks fullscreen coordination, command palette,
theme toggle both themes, reduced-motion pass (emulate
`prefers-reduced-motion`), 320/768/1440 widths, zero console errors.

## Commit discipline

Small logical commits with explicit pathspecs, in the order above (tokens ->
primitives x3 -> shell x3 -> tests). Record every sha on the control file.
