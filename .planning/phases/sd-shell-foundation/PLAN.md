# PLAN — Unit 1: Spacedrive foundation and app shell

Reconciled from the authoritative Fable seed (`.planning/fable-plan.md`) against
the live codebase. The seed is preserved; this records the concrete, verified
task order and the two reconciliations the code demanded. See UI-SPEC.md for the
design contract and token table.

## Reconciliations against the seed (why the code differs)

1. **Deck accent → `--hud-cyan`, not `--sd-accent`.** The seed maps
   `--deck-accent* -> --sd-accent*`. Verified: `--sd-accent/-faint/-deep` are
   defined ONLY inside `.wiki-explorer` (globals.css L1412-1414); they are
   undefined app-wide, so a `:root`/`.dark` alias to them would resolve to
   nothing outside the wiki explorer. The app-wide restrained cyan is the
   `--hud-cyan` family. Map `--deck-accent -> --hud-cyan`,
   `--deck-accent-faint -> --hud-cyan-dim`, `--deck-accent-deep -> --hud-cyan-light`.
2. **Deck ink → semantic `--ink`, not `--sd-ink`.** Same reason: `--sd-ink*`
   are `.wiki-explorer`-scoped (L1415-1417). App-wide theme-aware ink is
   `--ink`/`--ink-muted` (base at L38-39, dark override L1034-1035). Map
   `--deck-ink -> --ink`, `--deck-ink-dull -> --ink-muted`, `--deck-ink-faint ->
   color-mix(--ink-muted 65%, transparent)`.
3. **Surfaces/hairlines/states → `--sd-*` ladder** as the seed says: these ARE
   defined app-wide (`:root` L1374, `.dark` L1391), so aliasing is safe and
   gives primitives the Spacedrive tonal depth.
4. **Shell base surfaces stay semantic (`--surface`/`--canvas`/`--edge`).** The
   handoff insists the app keep Hyperpolymath's editorial identity and remain a
   life product. The shell adopts the Spacedrive *register* (unboxed rows, tonal
   active, hairlines, cyan-only accent, duration tokens) via deck vocabulary
   where it maps cleanly — not a wholesale recolor. The `--sd-*` tonal ladder
   lives in the `spacedrive/` primitives. In dark mode the semantic surfaces are
   already cool (hue 240), so the register reads coherent.

## Task order (commit-per-unit; explicit pathspecs)

- **C1 — Token layer** (`app/globals.css`): add `--deck-*` alias block in
  `:root` + `.dark` beside the sd ladder; add `--dur-*` tokens by the easings
  (~L85); extend the reduced-motion `@media` block to cover `.sd-motion` and
  the new spacedrive classes + shell. No existing value changes.
- **C2 — Primitives: panels/chrome** (`components/spacedrive/`): `DeckPanel`,
  `HairlineDivider`, `SectionHeader`, `EmptyState` + start `index.ts`.
- **C3 — Primitives: toolbars + data**: `CommandToolbar`, `ModeStrip`,
  `KpiRail`+`StatChip`, `DenseListRow`, `InspectorShell`+`MetaSection`+`MetaRow`.
- **C4 — Primitives: ambient**: `AmbientOrb` (own gradient, reduced-motion
  static, `data-testid`); finalize barrel exports.
- **C5 — Shell: Sidebar cluster** (`Sidebar.tsx` + globals sidebar helpers if
  needed): register pass, duration tokens, preserve every contract.
- **C6 — Shell: AppShell + TopTabBar + NavArrows + Breadcrumbs**: duration
  tokens, hairlines, tonal actives; preserve storage/events/tour attrs.
- **C7 — Shell: PersistentNav + CommandMenu + ShortcutsCheatSheet**: nav
  register + overlay glass; preserve badges, hotkeys, data-tour.
- **C8 — Tests** (`tests/`): `spacedrive-primitives.test.tsx` (smoke both
  themes, DenseListRow Enter/Space, ModeStrip aria-pressed, AmbientOrb static
  under mocked reduced-motion) and `shell-sidebar-contract.test.tsx`
  (`sidebar-collapsed`/`sidebar-show-archived` round-trip; `useTasksExpanded` →
  `tasks-expanded` key + `tasks-expanded-change` event).

## Goal-backward check (plan_check)

- Criterion "generic alias layer, no existing values changed, no third palette"
  → C1 adds aliases only; reconciliations keep everything on existing ladders.
- Criterion "spacedrive family with barrel, all listed primitives, both themes,
  wiki untouched" → C2-C4; wiki/ never imported or edited.
- Criterion "shell restyled, geometry + hover-overlay + tasks-expanded + split
  preserved" → C5-C7 change only tone/type/motion; behavior lines untouched.
- Criterion "frozen contracts intact" → C5-C7 leave storage keys, events,
  query keys, hotkeys, deep links byte-identical; C8 asserts the two riskiest.
- Criterion "reduced-motion static; focus>hover; responsive" → C1 reduced-motion
  block + primitive `useReducedMotion`/CSS gating; `--ring-focus` on primitives.
- Criterion "tests + typecheck + lint + test + build green + signed-in verify"
  → C8 + verification bar.

## Verification bar

`pnpm --filter web typecheck`, lint, `pnpm --filter web test`, `pnpm --filter web
build` — all green with evidence. Signed-in usage on port 3105: all nav routes,
sidebar collapse/expand/hover-overlay, tasks fullscreen, command palette, theme
toggle both themes, reduced-motion emulation, 320/768/1440 widths, zero console
errors.
