# Hyperpolymath Design System: "Spacedrive × Raycast × Renaissance"

The canonical reference for every surface and every agent working on this codebase. If a change disagrees with this document, the change is wrong or this document gets amended first (never silently).

A living, interactive reference for the sections below renders at [`/design`](/design), sourced directly from the shipped `.sd-*` utilities, tokens, and primitives so it can never drift from the implementation.

## 1. Register

One chrome dialect app-wide: the `--sd-*` register. Engineered density (Spacedrive) + polished translucency (Raycast) + the app's Renaissance editorial soul (a serif logotype, parchment light mode). Frosted-white neumorphic glass is retired. Spacedrive-native translucency (dark translucent chrome + backdrop blur) is part of the register, but it lives in chrome only, never in content cards.

The v2 posture, in one line: **full structural commitment, zero theatrics.** Density, hairlines, and a single accent do the work. Glow, gradient, and scale do not.

## 2. Tokens (globals.css is the source of truth)

- Surfaces (dark): the hue-235 sd ladder. `--sd-app` (canvas), `--sd-box` (cards), `--sd-dark-box` / `--sd-darker-box` (recessed), `--sd-sidebar` (aliases `--sd-darker-box`; the darkest surface in the app), `--sd-input` (insets, chip and pill fills), `--sd-line` (THE hairline), `--sd-divider`, `--sd-hover`, `--sd-selected`, `--sd-selected-item` (neutral selection backplate), `--sd-active`, plus the `--sd-menu*` family.
- Surfaces (light): sd tokens map onto the warm parchment neutrals (`--canvas` / `--surface` family). Light mode keeps the academic-paper identity; dark mode wears Spacedrive's indigo-black skin. (D11)
- Ink: `--sd-ink` / `--sd-ink-dull` / `--sd-ink-faint`. Never raw gray hex.
- Accent: JARVIS cyan owns the app. `--sd-accent` = `--hud-cyan` (oklch 72% 0.13 210), plus `-faint` and `-deep`; the light theme uses the dampened base. **One hue.** Functional inks (`--ink-sage` active, `--ink-amber` warn, `--ink-coral` danger) appear ONLY as 5-6px status dots and 15%-alpha tinted chips, never as chrome.
- `--sd-sidebar` is a **surface color, not a width**. The sidebar width is fixed (230px expanded, 56px rail).
- NO new hex literals in components. Consume tokens.

## 3. Typography

**Space Grotesk is the app-wide sans.** It is loaded via `next/font/google` (weights 400/500/600/700, `--font-space-grotesk`) and `--font-sans` resolves to it. So does `--font-serif`: that token is now a **no-op alias pointing at Space Grotesk**, kept only because hundreds of legacy `font-serif` usages (including shadcn primitives) still reference it. Treat `font-serif` as dead. Never add a new one; drop them on sight when you touch a file.

**EB Garamond survives in exactly one place:** the "Hyperpolymath" logotype, via `--font-logotype` and the `font-logotype` utility. The only sanctioned consumer is `components/ui/Logotype.tsx` (sidebar workspace pill, auth and landing wordmark). Serif anywhere else is banned (§16).

**JetBrains Mono** (`--font-mono`) is for micro-labels only: dates, eyebrows, kbd hints, unit captions, status micro-copy. It is not a UI font.

Sizing and tracking:
- Space Grotesk runs tight at display sizes. Greeting and stat values take `tracking-[-0.01em]`; section titles `tracking-[-0.01em]`.
- Uppercase micro-labels take `tracking-[0.08em]`; mono eyebrows go wider (`0.1em`–`0.16em`).
- Body is dull ink, headings are bright ink.

## 4. Selection: the two-tier law

Selected tiles and rows get the NEUTRAL backplate (`--sd-selected` / `--sd-selected-item`) plus an accent chip on the LABEL only. Never an accent ring, never an accent-filled row. Focus is `focus-visible:ring-2 ring-[var(--sd-accent)]` with `outline-none`.

## 5. Chrome grammar

- **Radii ladder** (deliberate, not a free choice): 6px sidebar and menu rows, buttons, small chrome. 8px tiles, icon buttons, area-tree chips. 10px workspace pill and inset sub-cards. 12px panels (`.sd-panel`) and mini entity cards. **14px widget cards** (the one deliberate step above 12px, and the reason widget cards read as the app's primary object). Full for pills. The verbatim `Chip` uses bare `rounded` (4px).
- **Elevation** = grey ladder + 1px `--sd-line` border + a white inset top hairline. `.sd-panel` carries `rgba(255,255,255,.15) 0 1px 0 inset`; the widget card uses a quieter `rgba(255,255,255,.09) 0 1px 0 inset`, applied in **dark scope only** (light mode gets its lift from the parchment ladder alone). Shadows stay ≤10% shade.
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

## 7. Page scaffold and tab bar

- Canvas is `--sd-app`, edge to edge. Content column has **no max-width**: `px-6 pt-5 pb-12`, sections stacked on a **28px rhythm** (`gap-7`). No hero plate, no banner, no gradient wash, no vignette, no noise on content.
- **Tab bar** (`components/shell/TopTabBar.tsx`) sits above every route: `h-11` container, tabs are `h-9 rounded-full` pills, `min-w-[220px] max-w-[480px] flex-1`. Active = `bg-[var(--sd-selected)]` + ink label; inactive = transparent + ink-faint. Transitions are **color-only, 80ms**. Close ✕ reveals on hover at the left; the kbd hint (`⌃1`) sits mono and ink-faint at the right.

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

## 14. Motion law

- Entrances: opacity 0→1, y 4→0, 160ms, `ease [0.25, 1, 0.5, 1]`, stagger `min(i,24) * 10ms`.
- Collapses: `AnimatePresence` height 0↔auto, 200-320ms on `cubic-bezier(0.32, 0.72, 0, 1)` (`--ease-collapse`).
- Micro (color / bg / border): 120-150ms ease-out. Tab transitions are 80ms and **color-only**. Sidebar easing is `[0.25, 1, 0.5, 1]`.
- Press: transform 100ms. Spring overshoot (~4%) ONLY on success and confirm moments.
- **The zero-jank law**: animate `opacity` / `transform` / `filter` and nothing else. Never animate `width`, `height` (outside a measured collapse), or layout. Everything is interruptible, guarded by `useReducedMotion()`, and never transitions on first paint. No hover-scale anywhere.

## 15. Ambient layer

`components/ui/ambient`: `AmbientGlow` (flat low-alpha accent pills under 80-150px blurs + feTurbulence film grain) and `FocalOrb` (one sphere maximum per page, ≤40px on content surfaces). The app shell keeps a barely-there whisper; **content surfaces get no ambient field and no noise.** Pauses on hidden tabs and under reduced motion. Text over glow stays AA in both themes.

## 16. Banned

Gradient washes (green/teal especially). Noise on content surfaces. Orbs above 40px. Serif anywhere but the logotype. Glow rings. Card glassmorphism. Accent-filled rows and accent rings for selection. Hover scales. Hover fills on sidebar nav rows. Italic serif empty states. More than one accent hue. `width`-animated progress. New hex literals.

## 17. Utilities index (globals.css)

`.sd-panel` (12px panel shell) · `.sd-status-pill` + `.sd-dot-*` + `.sd-tint-*` · `.sd-progress` / `-fill` / `-hatched` · `.sd-btn-primary` / `.sd-btn-ghost` · `.sd-topbar-blur` / `.sd-pill-blur` · `.sd-glow-*` / `.sd-noise-overlay` (chrome and hero only) · `.text-tiny` (0.65rem) · `.mask-fade-out` (40px bottom mask) · `.sd-scroll-hover` (scrollbar on hover only) · `.sd-stat-label` (legacy mono, kanban only) · easings `--ease-soft-landing`, `--ease-collapse`.

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
