# Hyperpolymath Design System: "Spacedrive × Raycast × Renaissance"

The canonical reference for every surface and every agent working on this codebase. If a change disagrees with this document, the change is wrong or this document gets amended first (never silently).

A living, interactive reference for the sections below renders at [`/design`](/design), sourced directly from the shipped `.sd-*` utilities, tokens, and primitives so it can never drift from the implementation.

> **Amended 2026-07-28 by SDC-1** (the jul-28 shared design contract, `.bgsd/seeds/jul-28-seed.md` §2). SDC-1 supersedes §2, §3, §5, §7 and §14 below, and those sections have been rewritten in place to state its values. The short version: the palette is calmed (body ink 12.4:1 light and 12.7:1 dark, Notion-parity hairlines, a desaturated hue-225 accent that replaces JARVIS cyan outside agent surfaces and the wiki), type runs on one six-step ladder with no arbitrary px, radii collapse to four values, page chrome comes from `<PageScaffold>` rather than six ad-hoc containers, and motion runs on four named durations with nothing under 140ms.

## 1. Register

One chrome dialect app-wide: the `--sd-*` register. Engineered density (Spacedrive) + polished translucency (Raycast) + the app's Renaissance editorial soul (a serif logotype, parchment light mode). Frosted-white neumorphic glass is retired. Spacedrive-native translucency (dark translucent chrome + backdrop blur) is part of the register, but it lives in chrome only, never in content cards.

The v2 posture, in one line: **full structural commitment, zero theatrics.** Density, hairlines, and a single accent do the work. Glow, gradient, and scale do not.

## 2. Tokens (globals.css is the source of truth) — SDC-1

**One base palette, two themes, and the whole `--sd-*` register is an alias onto it.** There are no literal surface values left outside `.wiki-explorer` (which redeclares its own ladder by design). Change a base token and the app re-tints; do not chase the 800+ call sites.

Base palette, pre-measured, do not substitute by eye:

| token | light | dark | note |
|---|---|---|---|
| `--canvas` | `oklch(98.5% 0.003 75)` `#fbfaf8` | `oklch(20.5% 0.006 255)` `#15171a` | the app background |
| `--surface` | `oklch(96.8% 0.004 75)` | `oklch(24.5% 0.007 255)` | recessed chrome (rail, panels) |
| `--surface-raised` | `#ffffff` | `oklch(28.5% 0.008 255)` | cards lift by being lighter |
| `--ink` | `oklch(31.5% 0.012 60)` 12.4:1 | `oklch(88.5% 0.006 255)` 12.7:1 | body, headings |
| `--ink-muted` | `oklch(55.5% 0.010 60)` 4.6:1 | `oklch(70.5% 0.008 255)` 6.8:1 | meta, secondary lines |
| `--ink-faint` | `oklch(66.5% 0.008 60)` 2.9:1 | `oklch(58.5% 0.008 255)` 4.3:1 | decorative only |
| `--edge` | `oklch(91.8% 0.004 75)` 1.22 | `oklch(30.5% 0.008 255)` | THE hairline, Notion parity |
| `--edge-strong` | `oklch(87.5% 0.005 75)` 1.40 | `oklch(36% 0.009 255)` | dividers that must read |
| `--hover` | `oklch(95.5% 0.004 75)` | `oklch(26.5% 0.007 255)` | |
| `--selected` | `oklch(93.5% 0.005 75)` | `oklch(30% 0.008 255)` | |
| `--accent` | `oklch(55% 0.09 225)` 4.53 | `oklch(74% 0.095 225)` | desaturated, hue 225 |

The sd register maps straight onto it: `--sd-app`→`--canvas`, `--sd-box`→`--surface-raised`, `--sd-dark-box` / `--sd-darker-box` / `--sd-sidebar`→`--surface`, `--sd-line` / `--sd-divider` / `--sd-menu-line`→`--edge`, `--sd-frame`→`--edge-strong`, `--sd-ink`→`--ink`, `--sd-ink-dull`→`--ink-muted`, `--sd-ink-faint`→`--ink-faint`, `--sd-hover`→`--hover`, `--sd-selected`→`--selected`, `--sd-accent`→`--accent`.

- **The accent budget is two per viewport.** Legal: the focus ring, one primary button, one active-state indicator, the primary data series. Illegal: hover borders, card borders, section headings, icon fills, a dot on every row. A card hover moves `border-color` to `--edge-strong`, never to the accent.
- **JARVIS cyan is no longer the app accent.** The `--hud-cyan*` family survives untouched as the agent-mode signature (`.agent-mode-scope`) and inside `.wiki-explorer`, which redeclares `--sd-accent` locally. Everywhere else the accent is the calmed hue-225 value.
- Focus is **one 2px ring**: `--ring-focus` = `0 0 0 2px var(--canvas), 0 0 0 3.5px var(--accent)`. The 4px double-cyan halo is retired; `--ring-doc` / `--ring-hud` still alias it.
- Functional inks (`--ink-sage` active, `--ink-amber` warn, `--ink-coral` danger) appear ONLY as 5-6px status dots and 12%-alpha tinted chips, never as chrome.
- `--sd-sidebar` is a **surface color, not a width**. The sidebar width is fixed (230px expanded, 56px rail).
- NO new hex literals in components. Consume tokens. A new value is a token and lands in `@theme` / `:root` / `.dark` with **both** themes filled in.
- Both theme blocks declare the sd alias table explicitly rather than sharing one unscoped `:root`. That is deliberate: an unscoped `:root` block silently outranks `.dark` at equal specificity, which is exactly how dark mode ended up painting near-black.

## 3. Typography

**Space Grotesk is the app-wide sans.** It is loaded via `next/font/google` (weights 400/500/600/700, `--font-space-grotesk`) and `--font-sans` resolves to it. So does `--font-serif`: that token is now a **no-op alias pointing at Space Grotesk**, kept only because hundreds of legacy `font-serif` usages (including shadcn primitives) still reference it. Treat `font-serif` as dead. Never add a new one; drop them on sight when you touch a file.

**EB Garamond survives in exactly one place:** the "Hyperpolymath" logotype, via `--font-logotype` and the `font-logotype` utility. The only sanctioned consumer is `components/ui/Logotype.tsx` (sidebar workspace pill, auth and landing wordmark). Serif anywhere else is banned (§16).

**JetBrains Mono** (`--font-mono`) is for micro-labels only: dates, eyebrows, kbd hints, unit captions, status micro-copy. It is not a UI font.

**SDC-1: one type ladder, six steps, registered in `@theme`.** New code may not use `text-[Npx]`.

| step | size / line-height | weight | colour | use |
|---|---|---|---|---|
| `text-display` | 30px / 1.2, `-0.02em` | 600 | `--ink` | page H1 only |
| `text-title` | 20px / 1.35, `-0.01em` | 600 | `--ink` | section H2, panel header, card title |
| `text-subtitle` | 16px / 1.45 | 500 | `--ink` | H3, list-item primary |
| `text-body` | 14.5px / 1.6 | 400 | `--ink` | default body, the baseline |
| `text-meta` | 13px / 1.5 | 400 | `--ink-muted` | secondary lines, meta rows, descriptions |
| `text-micro` | 11.5px / 1.4 | 500 | `--ink-faint` | counts, chips, timestamps. Sentence case. |

Size, line-height and tracking are baked into the step; weight and colour stay per-use.

Sizing and tracking:
- **Uppercase is banned** except `kbd` hints and the sidebar section eyebrows (which keep the `SB_*` grammar exported from `components/shell/Sidebar.tsx`). Never add one; delete them on sight when you are already in a file.
- **One surviving tracking value** for that surviving uppercase case: `0.06em`. `0.1 / 0.12 / 0.14 / 0.16 / 0.18 / 0.22em` are deleted.
- **Mono is for dates, `kbd` hints and numeric units only.** Never a label, heading, button, eyebrow, or empty state.
- H1 is `text-display` on every page, no exceptions.
- Numeric values get `tabular-nums`.
- Text blocks cap at `max-w-[68ch]`.
- Body is `--ink`; meta is `--ink-muted`; `--ink-faint` is decorative and never carries information a user has to read.

## 4. Selection: the two-tier law

Selected tiles and rows get the NEUTRAL backplate (`--sd-selected` / `--sd-selected-item`) plus an accent chip on the LABEL only. Never an accent ring, never an accent-filled row. Focus is `focus-visible:ring-2 ring-[var(--sd-accent)]` with `outline-none`.

## 5. Chrome grammar

- **Radius ladder, SDC-1: exactly four values.** `4px` chips and badges. `8px` buttons, inputs, rows, small chrome. `12px` cards, panels, popovers, dialogs. `9999px` pills and avatars. Any other radius in new code is a defect. `WidgetCard`'s 14px is grandfathered; new cards use 12px. Delete `rounded-[9px]`, `[7px]`, `[5px]`, `[3px]`, `[10px]` and `[6px]` on sight.
- **Elevation is fill, not shadow.** canvas `--canvas` → card `--surface-raised` → popover `--surface-raised` plus `0 4px 16px rgb(0 0 0 / 0.06)` light, `/ 0.30` dark. Cards, panels and the inline `SidePanel` get **no shadow**. The legacy white inset top hairline on `.sd-panel` survives as chrome texture; do not add it to new content surfaces.
- **One border per nesting level.** If the parent has a border, the child does not. Chips inside cards lose their border and use `bg-[var(--hover)]`. Never a bordered plate wrapping another bordered plate. Section separation prefers whitespace, then a single `--edge` hairline.
- **Card hover moves `border-color` to `--edge-strong` and nothing else.** No scale, no lift, no glow, no accent.
- **Spacing steps: 4, 8, 12, 16, 24, 32, 48** only (`gap-1 gap-2 gap-3 gap-4 gap-6 gap-8 gap-12`). `gap-0.5`, `gap-1.5`, `gap-2.5`, `gap-3.5` are banned in new code. Interactive row min-height 32px (`h-8`), list rows 36px (`h-9`), nothing below 28px. Card padding 20px (`p-5`), panel padding 16px (`p-4`), page gutter 32px. 32px between page sections, 16px inside a section, 12px inside a card.
- **Translucency**: `.sd-topbar-blur` (saturate 120% blur 18px) for toolbars, `.sd-pill-blur` for floating pills. The sidebar is **solid** (`--sd-sidebar` at 100%); web reads cleaner than the desktop vibrancy it borrows from.
- **Buttons**: `.sd-btn-primary` = accent fill, rounded-full, "lit from above" (accent ambient glow + white top bevel + dark bottom bevel). `.sd-btn-ghost` = white/10 fill, white/20 border, blur(8px).

## 6. Sidebar grammar

230px fixed (56px collapsed rail), `bg-[var(--sd-sidebar)]`, right hairline, `p-2.5 pb-2`, column `gap-2.5`, sections `space-y-5`, rows `gap-0.5`. Grammar constants are **exported from `components/shell/Sidebar.tsx`** (`SB_ROW`, `SB_ROW_ACTIVE`, `SB_GHOST`, `SB_FOCUS`). Consume them; do not retype the strings.

- **Rows**: `h-8 rounded-[6px] px-2 text-sm font-medium tracking-wide`, ink-dull. **No hover fill.** Hover moves ink-dull → ink and nothing else. ACTIVE is a bg tint only (`--sd-selected` at 40%), animated between rows with a shared `layoutId` pill. No left bar, no cyan tint, no icon recolor.
- **Two icon registers** (§13): feature/noun destinations use the **dimensional icons at 18px**; utility/verb rows (Search, Calendar, Graph, People, Settings, Nutrition) use quiet **lucide at 16px, stroke 1.75**. Both sit in a shared 18px slot so labels stay on one rail.
- **Section headers**: `h-6 px-2`, label `text-[11px] font-semibold uppercase tracking-[0.08em]` ink-faint. No chevron. The row's action (for example `+` create area) reveals on group hover: `opacity-0 group-hover/section:opacity-30 hover:!opacity-100 duration-300`.
- **Count badge**: `h-[19px] min-w-[20px] rounded-full px-1 text-[9px] tabular-nums` with a 40%-alpha `--sd-line` border. Rendered only when the count is non-zero.
- **SOON chip**: `h-[18px] rounded-[5px] bg-[var(--sd-box)] px-1.5 font-mono text-[10px] uppercase tracking-[0.08em]` ink-faint.
- **Structure**: workspace pill (h-9, `rounded-[10px]`, `--sd-box` + 50% line, 8px cyan status dot + `<Logotype/>` + chevron) → scroll column (MAIN nav, then AREAS with the tree) → **SYSTEM pinned to the footer**, outside the scroll, above the status row, identity block, and utility strip.
- **Scroll**: `sd-scroll-hover mask-fade-out ... pb-10`. No visible scrollbar until hover; the bottom 40px fades out under a mask rather than a hard edge.

## 7. Page scaffold and tab bar — SDC-1

**Every route uses `components/ui/PageScaffold.tsx`.** It replaces the six ad-hoc containers the repo grew (`px-8 py-10`, `px-6 pt-5`, `max-w-[1080px]`, `[920px]`, `[720px]`, `[1200px]`, …) so left edges line up across routes. The anatomy is fixed; do not vary it, and do not add props that vary spacing.

```tsx
<PageScaffold eyebrow? icon? title subtitle? meta? actions?>
  <PageScaffold.Section title? action?>…</PageScaffold.Section>
</PageScaffold>
```

- Outer: `mx-auto w-full max-w-[1120px] px-8 pt-10 pb-24`, centred **within the stage**, not the viewport.
- Eyebrow → 8px → title row (`icon` + `h1.text-display`, `gap-3`, `items-start`, actions right-aligned) → 8px → subtitle → 12px → meta row.
- Meta row: `flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-[var(--ink-muted)]`; the separator is a `·` at `--ink-faint`, not a chip and not a border. Values are plain text; only status uses `StatusPill`.
- `actions` carries **at most one** primary Button; everything else is ghost or icon.
- **The header block has no border and no background.** It sits on the canvas. The first hairline on a page is the first section divider.
- `PageScaffold.Section`: `mt-8` between sections, optional `h2.text-title` plus a 12px gap, optional `border-t border-[var(--edge)] pt-8` when a page has three or more sections.
- **No banner by default.** A route that already has one keeps it flush and edge to edge above the scaffold, and it gains no chrome.
- Inline-editable titles keep the click-to-edit pattern; the edit underline is `--edge-strong`, never a functional ink.
- **Empty states use `components/ui/EmptyState.tsx`.** `page` = `py-24`, `section` = `py-16`, `inline` = `py-8` with no icon and no action. Centred, `gap-3`, no border, no card, no background, no serif, no italic, no uppercase.
- **Tab bar** (`components/shell/TopTabBar.tsx`) sits above every route: `h-11` container, tabs are `h-9 rounded-full` pills, `min-w-[220px] max-w-[480px] flex-1`. Active = `bg-[var(--sd-selected)]` + ink label; inactive = transparent + ink-faint. Transitions are **color-only, 160ms**. Close ✕ reveals on hover at the left; the kbd hint (`⌃1`) sits mono and ink-faint at the right.
- **The shell is a three-zone cockpit** (rail / stage / right slot). The stage owns scroll and carries the app's only `@container/main`. The right slot is one grid track shared by the Dock and any `SidePanel`; there are never four live columns.

## 8. Greeting row and stat strip

**Greeting row** (replaces the killed hero plate; it sits directly on the canvas):
- Left: date line `font-mono text-[11px] uppercase tracking-[0.1em]` ink-faint ("MONDAY · JULY 13, 2026"), then the greeting at `text-[26px] font-semibold tracking-[-0.01em]` ink, with the **terminal period in `--sd-accent`**.
- Right: a **36px presence orb** (`FocalOrb`, 6s gentle bob, static under reduced motion) with a `JARVIS` mono caption beneath. It is a presence lamp, not a planet. Orbs above 40px are banned.

**Stat strip** (no card chrome; it sits on the canvas):
- Row of stats, `max-w-[1200px]`, each a `flex items-center gap-3` link with a hover backplate.
- **Icon-left**: dimensional icon in a 40px optical box (`size-10`). Diamond-silhouette icons render at 52px inside the same box to correct optically.
- Label: `text-[11px] font-semibold uppercase tracking-[0.08em]` ink-faint. This is **Space Grotesk, not mono.** (The mono `.sd-stat-label` utility is legacy and survives only in the kanban columns. Do not use it on new surfaces.)
- Value: `text-2xl font-black tabular-nums tracking-[-0.01em]` ink, with an optional unit at `ml-1 text-[16px] font-medium` ink-faint on the same baseline.
- Caption: `text-[12px]` ink-dull, prefixed where relevant by a 5px functional dot (coral "2 overdue", amber, sage, cyan).

## 9. Widget card v2 (the canonical content object)

Shell (`components/lifeos/WidgetCard.tsx`): `rounded-[14px]`, `bg-[var(--sd-box)]`, 1px `--sd-line` border (dark: `white/[0.06]`), dark-only inset top hairline, `transition-colors duration-150`. **Hover moves the border and nothing else.** No backdrop blur, no gradient, no glow, no scale. The whole card is clickable via a full-bleed absolutely-positioned link under the content layer; interactive children re-enable pointer events.

Anatomy, top to bottom (primitives in `components/ui/entity-card.tsx`):
- **Body**: `p-5` (20px).
- **Header**: 36px dimensional icon + stack (title `text-[15px] font-semibold tracking-[-0.01em]` ink; subtitle `text-[12px]` ink-dull) + a right stack holding the status pill and any `ActionLink` ("ALL →", `text-[11px] font-semibold uppercase tracking-wide` ink-faint → ink on hover).
- **StatusPill**: `h-6 rounded-full border-[var(--sd-line)] bg-[var(--sd-input)] px-2.5 text-[11px] font-medium tracking-wide` + a 6px dot. Tones: `active` / `progress` = cyan, `idle` = ink-faint, `danger` = coral. This React pill is **canonical inside cards**; the CSS `.sd-status-pill` is the standalone equivalent for surfaces that are not entity cards.
- **MetaRow**: 13px ink-dull label left, 13px `tabular-nums` ink value right.
- **ProgressRow**: 6px `rounded-full` track on `--sd-input`; the hatched projected segment is a **full-inset underlay** (`.sd-progress-hatched`, 45° accent/35 stripes) and the fill is a `scaleX` transform over it. **Animate `scaleX`, never `width`** (see §14).
- **Footer chip strip**: chips do not float mid-card. They live in a hairline-separated footer: `h-10 shrink-0 flex-row items-center gap-1.5 border-t border-[var(--sd-line)] px-2`.
- **Empty states**: plain `text-[13px]` ink-faint ("No habits yet") plus a 40px dimensional icon at 40% opacity. No italic serif.

**Grid**: 12 columns (`@3xl/main:grid-cols-12`, `auto-rows-[minmax(180px,auto)]`, `gap-4`). Tasks spans 8 (2 rows); Habits and Training stack at 4 each; Captures spans 12 with an inner grid of flat sub-cards (`bg-[var(--sd-input)]`, `rounded-[10px]`, **no border-in-border nesting**). Insights is a full-width card sibling below the grid.

**Spread**: the widget card is the shared content-object primitive well beyond LifeOS. It now backs the Today widgets (Upcoming Tasks, Habits, Training, Recent Captures, Insights), the habits page, capture cards, the nutrition stats / macro summary / meal surfaces, the journal entry editor, the JARVIS personality and startup editors, the settings sd-primitives, and the `/design` sample. Consume `components/lifeos/WidgetCard.tsx` and the `entity-card.tsx` anatomy; do not restate the shell.

## 10. Chips and pills (one grammar, app-wide)

The verbatim Spacedrive chip, from `entity-card.tsx`:

```
inline-flex items-center gap-1 rounded border border-[var(--sd-line)]
bg-[var(--sd-box)] px-1.5 py-[1px] text-[0.65rem] font-medium
tracking-wide text-[var(--sd-ink-dull)]
```

`0.65rem` is registered as the **`text-tiny`** step. A tone (cyan or coral only) tints it: text in the hue, border `color-mix(hue 30%, --sd-line)`, background `color-mix(hue 15%, --sd-box)`. `OverflowChip` is identical geometry with `tabular-nums` ink-faint and reads `+N more`. `ChipRow` is `flex flex-wrap items-center gap-1.5`.

The areas tree uses a taller **chip-button** variant of the same idea for its controls and child-project rows: `h-[26px] rounded-[8px] px-2 text-[12px] font-medium`, `--sd-input` fill when active, transparent with a hairline on hover when not.

## 11. Areas tree v2

De-glowed and tokenized in both themes.
- **Connectors**: static 1px `--sd-line` SVG strokes (trunk drop 32px, branch rise 28px, 6px orthogonal elbow radius). **Junction dots are 3px** `--sd-accent` at 70% opacity: no halo, no blur, no pulse.
- **Root avatar node**: 56px, `rounded-[12px]`, 1px `--sd-line`, inset hairline. **No glow ring.**
- **Area card** = a mini entity card, `w-[200px]`, `rounded-[12px]`, `--sd-box` + hairline + inset. Hover moves the border only. Inside: a **28px icon backplate** (`rounded-[7px]`, `--sd-input`) that keeps the user's emoji when set and falls back to `AreaIcon` at 18px, the name at `text-[14px] font-medium`, and a count line at `text-[11px] font-semibold uppercase tracking-[0.08em]` ink-faint ("1 PROJECT").
- **Child projects** render as chip rows (max 6 + overflow chip) using `DynamicIcon` at 13px.
- **Empty**: "No projects yet", `text-[12px]` ink-faint, plain. No italic serif.
- **User emoji is never replaced.** It sits in a dimensional backplate.

## 12. Inspector grammar

`InspectorShell` + `MetaSection` / `MetaRow` from `components/ui/explorer`: section title = xs bold; rows = xs dull label left (small icon), ink value right, `--` when empty. Pills: `bg-sd-selected` 11px medium dull; tags tinted `color+CC` with white text.

## 13. Icons

Dimensional SVG icons only (`components/ui/icons`): gradient-layered bodies (cool indigo family), `useId`-scoped defs, token-driven drop shadow, `dropTarget` dashed-accent state. **Accent is never a body fill.** They must hold legibility at 18px (the sidebar floor) and read cleanly at 24px. They are the register's mascots, and they are the reason nouns feel like objects.

The two registers, restated because it is the most commonly broken rule: **nouns get dimensional icons; verbs get lucide.** Sidebar features 18px, widget card headers 36px, stat strips 40px, empty states 40px at 40% opacity, `/design` samples 24/48px.

**The shared recipe** (`components/ui/icons/shared.tsx`): every dimensional icon is an 80x80 SVG built from ONE recipe — `useIconIds` for collision-free scoped defs, `BodyGradient` for the cool-indigo body material, `ICON_INNER_SHADOW` / `ICON_CREASE` for embossed depth, and a token-driven `feDropShadow` riding `--sd-icon-shadow*` (both themes first-class, no per-theme file). **A new feature icon is a local file composing that recipe, never a fork of it.** Add `XIcon.tsx` that pulls in the shared helpers and draws only its motif, then re-export it from `components/ui/icons/index.ts`. Never restate the material, the shadow, or the id-scoping; never fill the body with accent (accent lives in the `dropTarget` frame only).

## 14. Motion law — SDC-1

**Four named durations, registered in `@theme`. Nothing under 140ms, nothing over 320ms.**

| token | value | use |
|---|---|---|
| `--duration-micro` | 160ms | colour, background, border, opacity |
| `--duration-enter` | 220ms | enter / exit |
| `--duration-panel` | 260ms | layout and panel |
| `--duration-collapse` | 280ms | collapse |

Easings: enter/exit `--ease-out-quart` `cubic-bezier(0.25,1,0.5,1)`; layout, panel and collapse `--ease-collapse` `cubic-bezier(0.32,0.72,0,1)`; micro `ease-out`.

- **Animate `opacity`, `transform`, `color`, `background-color`, `border-color` only.** The one sanctioned width animation in the app is the cockpit's right slot, and it runs on `grid-template-columns`, never on the `width` of a flex child.
- **Never put `layout` and a `y` transform on the same node.** Motion's layout projection and the `y` animation both write `transform`; an interrupted animation settles at `translateY(4px)`. This is the literal root cause of the drooping wiki tiles.
- Entrances: opacity 0→1, y 4→0, 220ms `--ease-out-quart`. Stagger `min(i, 12) * 20ms`, capped at 240ms.
- Press: transform 100ms is the one sanctioned sub-140ms case. Spring overshoot (~4%) ONLY on success and confirm moments.
- **Never**: hover scale, page-level slides, anything looping on a content surface. The `hud-*` keyframes stay quarantined inside `.agent-mode-scope` and must not appear on a page surface.
- **Route swaps snap.** No template, no fade, no slide, no stagger; `app/(app)/template.tsx` is deleted. Perceived transition quality comes from `app/(app)/loading.tsx` and per-route skeletons, not from a remount.
- Every `motion` component guards with `useReducedMotion()`; every CSS animation guards with `@media (prefers-reduced-motion: reduce)`. No transition on first paint: `initial={false}` on every `AnimatePresence`. Everything is interruptible.

## 15. Ambient layer

`components/ui/ambient`: `AmbientGlow` (flat low-alpha accent pills under 80-150px blurs + feTurbulence film grain) and `FocalOrb` (one sphere maximum per page, ≤40px on content surfaces). The app shell keeps a barely-there whisper; **content surfaces get no ambient field and no noise.** Pauses on hidden tabs and under reduced motion. Text over glow stays AA in both themes.

## 16. Banned

Gradient washes (green/teal especially). Noise on content surfaces. Orbs above 40px. Serif anywhere but the logotype. Glow rings. Card glassmorphism. Accent-filled rows and accent rings for selection. Hover scales. Hover fills on sidebar nav rows. Italic serif empty states. More than one accent hue. `width`-animated progress. New hex literals.

SDC-1 adds: uppercase outside `kbd` and the sidebar eyebrows. Mono outside dates, `kbd` hints and numeric units. `text-[Npx]` in new code. Off-ladder radii. `gap-1.5` / `gap-2.5` / `gap-3.5`. `transition-all`. `hover:border-[var(--sd-accent)]`. More than two accent-coloured elements per viewport. A bordered plate wrapping another bordered plate. A shadow on a card, panel or side panel. `layout` and `y` on the same motion node. A second `SidePanelHost`, or any re-introduced `fixed` detail panel.

## 17. Utilities index (globals.css)

`.sd-panel` (12px panel shell) · `.sd-status-pill` + `.sd-dot-*` + `.sd-tint-*` · `.sd-progress` / `-fill` / `-hatched` · `.sd-btn-primary` / `.sd-btn-ghost` · `.sd-topbar-blur` / `.sd-pill-blur` · `.sd-glow-*` / `.sd-noise-overlay` (chrome and hero only) · `.text-tiny` (0.65rem) · `.mask-fade-out` (40px bottom mask) · `.sd-scroll-hover` (scrollbar on hover only) · `.sd-stat-label` (micro label: 11.5px sans, sentence case) · easings `--ease-soft-landing`, `--ease-collapse` · durations `--duration-micro` / `-enter` / `-panel` / `-collapse`.

## 18. Both themes, zero jank

Every surface verifies in light AND dark before it ships. Animation QA is a gate, not a polish pass: no layout shift on entrance, no mount flashes, no orphaned hover states, compositor-only at 60fps, reduced-motion clean.

## 19. For agents

Read this file before touching UI. Consume the shipped primitives (`components/ui/entity-card`, `components/ui/explorer`, `components/ui/icons`, `components/ui/ambient`, the `SB_*` constants from `components/shell/Sidebar`) instead of re-implementing them, and consume `.sd-*` utilities and tokens instead of literals. The two-tier selection law, the single-hue rule, the noun/verb icon split, and the zero-jank law are non-negotiable. Atomic commits, explicit pathspecs, both-theme verification with evidence.

## 20. JARVIS console grammar

The JARVIS surfaces (`components/jarvis`) speak a **mono, instrument voice** on the sd register. The console (`JarvisConsole.tsx`) and its HUD primitives (`HudStatusPill`, `HudThinkingRing`, corner crops, edge instrumentation) render status and telemetry in `--font-mono` micro-copy; the prose answer itself stays Space Grotesk.
- **Receipts** (`JarvisReceipt.tsx`): one solid `--sd-box` plate per action, hairline `--sd-line` border, **no blur, no bevel, no glow**. Each receipt leads with a flat inset **intent pill** (`--sd-input` fill) carrying a lucide verb icon and a mono label; undo folds into a cyan pill plus a hairline row.
- **Functional pill inks**: the single cyan accent (`--sd-accent`) marks actions (create / update / remember / ask); functional red (`--ink-coral`) marks destructive deletes and errors; passive finds stay neutral ink-faint (a lookup is not accent-worthy). This is the one place the functional inks carry semantic weight beyond a status dot, and they do it through the chip grammar of §10, never as chrome.

## 21. Data-series color law

Charts and diagrams are the **one sanctioned exception** to the single-hue rule (§1), and only as *data encoding*, never as chrome.
- **Cyan (`--sd-accent`) is always the primary series.** The first / primary metric plots cyan.
- Additional series may use the functional inks as **series (data-source) encoding**: `--ink-amber` then `--ink-coral` for the second and third series. Canonical example: `MacroTrendChart` — protein cyan, carbs amber, fat coral. No new hues, no gradient fills; the grid is 1px `--sd-line` and axis labels are mono (`--font-mono`, ~10.5px).
- **A mono legend is REQUIRED whenever more than one series is plotted.** Legend chips mirror the plotted series 1:1 — a `h-[3px] w-3.5 rounded-full` swatch in the series color plus a `font-mono text-[10.5px] uppercase tracking-[0.08em]` ink-dull label. A multi-color chart shipped without its legend chips is a defect.

## 22. SFX (the space-console core pack)

`lib/ui/sfx.ts` — eight tiny, pitch-coherent UI cues synthesized at runtime through the shared gesture-unlocked `AudioContext` (`lib/voice/audio-context`). Zero audio assets: each cue is a short envelope over one or two sine/triangle partials derived from a single tonal center (C5), so the whole family reads as one instrument.
- **The cues** (`CueName`): `sidebarCollapse` / `sidebarExpand` / `viewToggle` / `taskComplete` / `captureSent` / `habitCheck` / `dialogOpen` / `error`. Fire with `sfx.play("taskComplete")`.
- **Law**: every cue < 180ms, quiet (peak well under the existing chimes), never stacks (per-cue 120ms throttle), and **silent when the AudioContext is locked** (no gesture yet) or muted. Audio never throws and never blocks an interaction.
- **Mute contract (two keys)**: `hp:sfx-muted` (`lib/ui/sound-prefs`) is the **master mute** — it silences the chimes AND the core pack. `ui:sfx` (default ON) is the independent toggle for just the core pack, exposed as `isSfxEnabled` / `setSfxEnabled` for a settings switch. `sfx.play` short-circuits on either.

## 23. Inline-style token routing (the sanctioned scan-gap escape)

Tailwind's Oxide scan can miss an **arbitrary utility used in only one file** (verified: `bg-[var(--sd-sidebar)]` and `font-logotype` were never emitted). When a token lookup is genuinely one-off, the sanctioned routes, in order:
1. Reuse a utility already emitted elsewhere (grep the compiled CSS or another call site first).
2. Add a real class to `globals.css` (§17) and consume it.
3. **Route the token through an inline `style={{}}`** — e.g. `style={{ backgroundColor: "var(--sd-box)" }}` or `style={{ fontFamily: "var(--font-mono)" }}`. Inline style is not a smell here; it is the escape hatch for the scan gap, and the sd charts and legends use it deliberately (series colors, mono axis fonts).

After introducing any new arbitrary utility, **verify it in the compiled CSS or computed styles before claiming done.** Never assume an arbitrary class emitted.

## 24. The cockpit shell (SDC-1 §2.1, §2.2, §2.8)

The app is a three-zone control centre. One CSS grid, one row, three tracks:

```
┌────────┐ ┌──────────────────────────┐ ┌───────────────┐
│  RAIL  │ │          STAGE           │ │  RIGHT SLOT   │
│ nav +  │ │   active feature route   │ │ Dock (default)│
│  tree  │ ├──────────────────────────┤ │      OR       │
│        │ │  🥝 ask kiwi…          ⏎ │ │  SidePanel    │
└────────┘ └──────────────────────────┘ └───────────────┘
```

- **RAIL** (`components/shell/cockpit/Rail.tsx`), track `auto`. Feature nav plus the contextual tree. The Sidebar's own `w-14` / `w-[230px]` transition sizes the track; collapse persists under `sidebar-collapsed`. The rail wrapper stays `overflow-visible` at rest so the collapsed rail's hover-peek overlay can float past it.
- **STAGE** (`Stage.tsx`), track `minmax(0,1fr)`. The only zone that swaps on navigation, and the only zone that scrolls. Its scroll container carries the app's **only** `@container/main`; every `@3xl/main` and `@4xl/main` variant in the app resolves against it, so it must not be renamed or re-boxed.
- **JARVIS command bar** (`JarvisCommandBar.tsx`), a fixed-height flex sibling pinned below the scroll box. It never overlays content and therefore never fights editors. `⌘J` focuses it, `⌘⇧J` expands to the console, `Enter` sends, `Escape` collapses the answer strip then blurs. **It never autofocuses.** It consumes the existing `POST /api/jarvis` SSE contract; it does not duplicate `GlobalJarvisDialog`, and `⌘K` stays the dialog's.
- **RIGHT SLOT** (`RightSlot.tsx`), the only animated track. The Dock by default, a `SidePanel` when one opens, and **never both**: rail + stage + dock + a detail panel is four live columns, which starves the stage to roughly 600px on a 14-inch screen. Opening a panel slides the Dock out; closing it restores the Dock at its prior collapse state. `≥1280` the Dock may be expanded (280px); `1024-1279` it is forced collapsed (44px), derived and never persisted; `<1024` it is absent and a `SidePanel` degrades to an overlay-less sheet.

**`<SidePanel>` is the only detail-panel mechanism.** No portal, no `position: fixed`, no overlay, no backdrop, no dimming, no shadow, no focus trap, no scroll lock. Content reflows around it; you keep working with it open. Anything that reads or edits an entity is a `SidePanel`; modals are reserved for destructive confirmation and blocking multi-field creation. Exactly one `SidePanelHost` exists, in the shell. Never mount a second, and never re-introduce a `fixed` detail panel.

**The Dock is a registry, not a strip** (`cockpit/dock-registry.ts`). A widget declares `{ id, title, defaultDocked?, order?, useData, Compact, Expanded? }` and registers by adding one file under `components/dock-widgets/` plus one appended line in `manifest.ts`. **Zero shell edits.** The Dock calls `useData()` inside the widget's own error boundary, so its fetching, its subscription and its failure mode stay its own. Widget ids are persistence keys (`cockpit-dock-widgets`, alongside `cockpit-dock-collapsed`), so they are stable kebab-case forever. Treat `DockWidgetDef` as published API: additive changes only.

## 25. Craft v2 amendment (2026-08-04)

The register grows a second layer: Craft.do's canvas-vs-sheet architecture. The rule is structural, and it is the one to memorize. **Chrome sits flat on the canvas; elevation belongs to content.** The sidebar, dock, and top bar own no box, no border, and no shadow of their own. The stage sheet, cards, and overlays carry every shadow in the app.

New classes (globals.css, "craft register v2"; each resolves both themes through the token ladder, so no per-consumer dark work is needed):

- `.craft-canvas-chrome`: transparent, borderless, shadowless chrome for containers that sit directly on the canvas (Sidebar, Dock). Replaces `craft-glass rounded-panel` on those containers.
- `.craft-pill`: white pill chrome (raised fill, hairline `--edge`, `--shadow-card`, full radius). Hover lifts to `--shadow-card-hover` and changes nothing else. For the top-bar cmd-K search field and small floating chrome such as the collapsed Jarvis bar.
- `.craft-chip`: 28px segmented filter pill. Rest is raised fill, hairline, muted ink, no shadow. Active state keys off `aria-pressed="true"` or `data-active` and fills with the generic tint triple; compose with a `.tint-<hue>` class for a tinted active, or leave untinted for the neutral `--selected` fill. The tint is the one accent moment a chip row gets.
- `.craft-glass-pop`: frosted overlay surface (translucent panel fill, `blur(20px) saturate(160%)`, hairline light edge, `--shadow-pop`, card radius) with a solid fallback where `backdrop-filter` is unsupported. A cascade upgrade applies the same recipe to `.sd-menu-surface` and `.sd-modal-surface`, so every shadcn popover, dropdown, select, tooltip, dialog, alert-dialog, and command dialog frosts without touching a call site. Radius stays with the consumer (12px menus, 14px modals, 8px tooltips).
- `.craft-day-tile`: agenda day tile (date + weekday stack) in canvas gray; `[data-today]` switches to the sky pastel with in-family ink. Defined ahead of the calendar and agenda work so that API is already stable.
- `.craft-backdrop` is calmed: the three radial pastels drop to roughly half their previous alpha. Craft's canvas is nearly flat; the wash should be felt, not seen.
- `.craft-card-hover` is unchanged, but it is now expected on every interactive `craft-card`, not just a lucky few.

Live samples: `/design` § 16.
