# UI-SPEC — Unit 1: Spacedrive foundation and app shell

Design contract for the Renaissance control-deck foundation. Sealed visual
decisions come from `docs/design/LIFE_OS_SPACEDRIVE_HANDOFF.md` and the three
pinned references under `docs/design/spacedrive-references/`. Spacetribe is
excluded. This unit owns ONLY `globals.css`, `components/shell/**`, net-new
`components/spacedrive/**`, and net-new `tests/`.

## 1. North star

A **Renaissance control deck**: Spacedrive's layered dark utility shell and
restrained cyan energy; Raycast's speed, focus, keyboard polish, and motion
discipline; Hyperpolymath's existing Wiki/Renaissance editorial identity. It
stays a life-management product, never a file-manager clone.

## 2. Token vocabulary (§globals.css)

Two existing ladders already exist and are authoritative:
- **Semantic base** (`--canvas --surface --surface-raised --ink --ink-muted
  --edge --edge-hud`) — theme-aware app-wide; dark values are already cool
  (hue 240). This carries Hyperpolymath's editorial identity.
- **Spacedrive `--sd-*` ladder** (Wiki Renaissance) — `--sd-app --sd-box
  --sd-dark-box --sd-darker-box --sd-input --sd-line --sd-divider --sd-hover
  --sd-selected --sd-active` defined app-wide in `:root` + `.dark`; the
  `--sd-accent*` and `--sd-ink*` variants exist ONLY inside `.wiki-explorer`.

New generic **`--deck-*` alias layer** sits over both so feature surfaces stop
reaching for wiki-named or raw values. No third palette; no existing value
changes.

| deck token | maps to | rationale |
|---|---|---|
| `--deck-app` | `--sd-app` | explorer canvas tonal depth |
| `--deck-panel` | `--sd-box` | layered panel |
| `--deck-panel-deep` | `--sd-dark-box` | deeper inset |
| `--deck-panel-deeper` | `--sd-darker-box` | deepest inset |
| `--deck-input` | `--sd-input` | field surface |
| `--deck-line` | `--sd-line` | hairline border |
| `--deck-divider` | `--sd-divider` | section divider |
| `--deck-hover` | `--sd-hover` | row hover |
| `--deck-selected` | `--sd-selected` | tonal active/selected |
| `--deck-active` | `--sd-active` | pressed/active-strong |
| `--deck-accent` | `--hud-cyan` | **reconciliation:** `--sd-accent` is wiki-scoped/undefined app-wide; the app-wide restrained cyan is `--hud-cyan`. Chrome accent is cyan-only. |
| `--deck-accent-faint` | `--hud-cyan-dim` | faint cyan wash |
| `--deck-accent-deep` | `--hud-cyan-light` | deep cyan |
| `--deck-ink` | `--ink` | **reconciliation:** `--sd-ink` is wiki-scoped; app-wide theme-aware ink is `--ink`. |
| `--deck-ink-dull` | `--ink-muted` | muted text |
| `--deck-ink-faint` | `color-mix(--ink-muted 65%)` | faintest text |

Multi-accent inks (`--ink-amber/-sage/-coral/-violet/-blue`) remain for DATA
semantics only — never chrome.

**Motion duration tokens** (none exist today; durations are inline). Encode the
sealed budget:
`--dur-hover: 130ms; --dur-select: 180ms; --dur-tree: 170ms; --dur-panel: 220ms;
--dur-route: 260ms; --dur-orb: 14s;`

## 3. Motion budget (sealed)

hover 120–140ms · selection 160–200ms · tree 160–180ms · panels 200–240ms ·
route reveal 240–280ms max · orb 12–16s transform/opacity ONLY. Reduced motion
becomes fully static. CSS motion in this unit's surfaces is gated by an extended
`@media (prefers-reduced-motion: reduce)` block covering the new `spacedrive/`
classes and shell; JS motion uses `useReducedMotion()` from `motion/react`.

## 4. `spacedrive/**` primitive family

All token-styled (deck aliases), correct in both themes, minimal typed props,
`"use client"` only where interactivity demands, no console errors.

- **Panels/chrome:** `DeckPanel` (tonal layered panel, `--deck-line` border, NO
  hover glow — heavy blur/glass reserved for overlays), `HairlineDivider`
  (horizontal/vertical, `--deck-divider`), `SectionHeader` (operational
  typography: sans/mono, uppercase eyebrow option; NO Garamond in chrome),
  `EmptyState` (icon slot + title + description + optional action).
- **Toolbars:** `CommandToolbar` (tier 1: identity + primary actions) and
  `ModeStrip` (tier 2: view modes/filters, real `<button>`s, `aria-pressed`
  toggles, `--ring-focus` visible focus).
- **Data display:** `KpiRail` + `StatChip` (compact quiet-density KPI rail:
  label + value + optional delta), `DenseListRow` (40px: leading glyph slot,
  title, trailing meta; keyboard-activatable Enter/Space; focus-visible ring),
  `InspectorShell` + `MetaSection` + `MetaRow` (generic inspector panel).
- **Ambient:** `AmbientOrb` — exactly ONE ambient energy source per major
  surface (consumers enforce singularity; documented in JSDoc). Our OWN radial
  gradient (never Spacedrive's asset), 12–16s loop, transform/opacity ONLY,
  `useReducedMotion` → static frame; `data-testid="ambient-orb"`.

Barrel `index.ts` re-exports all primitives + their public types.

## 5. Shell restyle register

Preserve ALL behavior exactly; change only typography, edges, tone, motion.

- **Sidebar:** unboxed idle rows (no boxed cards at rest), tonal active via the
  soft-pill helpers, hairline section dividers, restrained cyan only as accent,
  no Garamond in chrome nav (existing serif nav labels are a pre-existing
  identity choice — keep operational typography for NEW chrome). PRESERVE
  260px/64px geometry, collapsed hover-overlay expansion (inner→260px, z-50,
  page never reflows), pin chevron, anchored footer utilities, `sidebar-collapsed`
  + `sidebar-show-archived` storage, areas/projects realtime + optimistic split,
  archive-undo, all SidebarTree menus/dnd.
- **AppShell:** token surfaces; PRESERVE tasks-expanded collapse (swap 0.2s
  inline → `--dur-panel`, `useReducedMotion`-gated, `sidebarAnimating` overflow
  guard), split-screen 70/30, `/today` + `/onboarding` panel suppression,
  `/wiki` full-height.
- **TopTabBar / PersistentNav / NavArrows / Breadcrumbs:** hairlines, tonal
  actives, duration tokens; PRESERVE `top-tab-last-route`/`top-tab-today-route`
  storage, `data-tour` attrs, calendar badge, split toggle semantics.
- **CommandMenu / ShortcutsCheatSheet:** overlays — the ONE place heavier
  glass/blur is allowed. Raycast register: fast, focused, keyboard-first.

## 6. Accessibility + responsive gates

- `prefers-reduced-motion` → shell + all primitives fully static.
- Focus-visible MORE visible than hover (`--ring-focus`).
- Enter/Space activate; Escape closes overlays; touch exposes actions (rail
  links work on tap without requiring hover).
- 320 / 375 / 768 / 1024 / 1440 widths: no clipped primary actions; collapsed
  rail usable; hover-expansion never traps touch users.

## 7. Frozen contracts (verify, never alter)

localStorage: `sidebar-collapsed`, `sidebar-show-archived`, per-area collapse,
`top-tab-last-route`, `top-tab-today-route`, `tasks-expanded` (+event
`tasks-expanded-change`), `split-screen-on` (+event `split-screen-change`),
`hp_tour_pending`/`hp_tour_v1_done`, SFX, theme. Query/realtime:
`tableKey("areas"|"projects", userId)`, `useTableSubscription` singletons,
optimistic areas/projects split, archive-undo (immediate-commit). Events:
`hp:tour-pending`. Hotkeys: Cmd+K, Cmd+Shift+K, Cmd+[/], Ctrl+1/2/3,
Ctrl+Alt+C/T/E/P. Deep links `?create=now`.

## 8. Verification bar (no silent green)

`pnpm --filter web typecheck`, lint, `pnpm --filter web test`, `pnpm --filter web
build` all green with evidence; net-new vitest tests (primitives smoke +
keyboard + reduced-motion; sidebar persistence + tasks-expanded) pass; signed-in
usage on port 3105 with zero console errors.
