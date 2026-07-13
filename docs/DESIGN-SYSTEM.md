# Hyperpolymath Design System: "Spacedrive × Raycast × Renaissance"

The canonical reference for every surface and every agent working on this codebase. If a change disagrees with this document, the change is wrong or this document gets amended first (never silently).

A living, interactive reference for the sections below renders at [`/design`](/design), sourced directly from the shipped `.sd-*` utilities and tokens so it can never drift from the implementation.

## 1. Register

One chrome dialect app-wide: the `--sd-*` register. Engineered density (Spacedrive) + polished translucency (Raycast) + the app's Renaissance editorial soul (EB Garamond moments, parchment light mode). Frosted-white neumorphic glass is retired; Spacedrive-native translucency (dark translucent chrome + backdrop blur) is part of the register.

## 2. Tokens (globals.css is the source of truth)

- Surfaces (dark): the hue-235 sd ladder — `--sd-app` (canvas), `--sd-box` (cards), `--sd-dark-box`/`--sd-darker-box` (recessed), `--sd-input`, `--sd-line` (THE hairline), `--sd-hover`, `--sd-selected`, `--sd-selected-item` (neutral selection backplate), plus the sidebar family (darkest surface in the app, ~65% opacity over canvas).
- Surfaces (light): sd tokens map to the warm parchment neutrals (`--canvas`/`--surface` family). Light mode keeps the academic-paper identity; dark mode wears Spacedrive's indigo-black skin. (D11)
- Ink: `--sd-ink` / `--sd-ink-dull` / `--sd-ink-faint`. Never raw gray hex.
- Accent: JARVIS cyan owns the app — `--sd-accent` = `--hud-cyan` (oklch 72% 0.13 210), `-faint`, `-deep`; light theme uses the dampened base. One hue. Functional hues (green active, amber warn, red danger) appear ONLY as 6px status dots and 15%-alpha tinted chips, never as chrome.
- NO new hex literals in components. Consume tokens.

## 3. Selection: the two-tier law

Selected tiles/rows get the NEUTRAL backplate (`--sd-selected-item`) plus an accent chip on the LABEL only. Never an accent ring or accent-filled row. Focus is `focus-visible:ring-2 ring-[var(--sd-accent)]` with `outline-none`.

## 4. Chrome grammar

- Radii: 6px default chrome (buttons, rows, menus), 8px tiles, 12px entity cards/panels, full for pills. Nothing above 12px except deliberate floating surfaces.
- Elevation = grey ladder + 1px `--sd-line` border + 0.5-1px white inset top hairline (`rgba(255,255,255,.15-.3) 0 1px 0 inset`). Shadows stay ≤10% shade. `.sd-panel` is the canonical card shell.
- Translucency: `.sd-topbar-blur` (saturate 120% blur 18px) for toolbars; `.sd-pill-blur` for floating pills; sidebar at ~65% over canvas.
- Buttons: `.sd-btn-primary` = accent fill, rounded-full, "lit from above" (accent ambient glow + white top bevel + dark bottom bevel). `.sd-btn-ghost` = white/10 fill, white/20 border, blur(8px).

## 5. Entity card anatomy (dashboards, widgets)

Header: dimensional icon in subtle backplate + medium title + dull subtitle + right-aligned status pill (rounded-full, colored 6px dot + tiny label). Optional progress row: dull label left, ink value right, `.sd-progress` track with accent fill + `.sd-progress-hatched` 45° striped projected segment. Chip row: 6px-radius quiet pills + "+N more" overflow. Card: `.sd-panel`, 16-20px padding.

## 6. Stat strip

Dimensional icon (28-32px) + `.sd-stat-label` (JetBrains Mono 10px uppercase tracking-wide ink-faint) + bold 2xl/3xl numeral in ink + one dull caption. No card chrome around the strip.

## 7. Inspector grammar

`InspectorShell` + `MetaSection`/`MetaRow` from `components/ui/explorer`: section title = xs bold; rows = xs dull label left (small icon), ink value right, `--` when empty. Pills: `bg-sd-selected` 11px medium dull; tags tinted `color+CC` white text.

## 8. Icons

Dimensional SVG icons only (`components/ui/icons`): gradient-layered bodies (cool indigo family), `useId`-scoped defs, token-driven drop shadow, `dropTarget` dashed-accent state. Accent never as body fill. Must read at 24px. User-set emoji are never replaced; they sit in dimensional backplates.

## 9. Motion law

- Entrances: opacity 0→1, y 4→0, 160ms easeOut, stagger `min(i,24)*10ms`.
- Collapses: AnimatePresence height:auto on `cubic-bezier(0.32,0.72,0,1)`.
- Micro: color/bg/border 120-150ms ease-out. Hover soft-landing: transform/shadow 200ms `cubic-bezier(0.23,1,0.32,1)`, opacity trailing 400ms. Press: transform 100ms.
- Dialogs: content `opacity 0→1, translateY(-2%) scale(.96)→1`; overlay plain fade.
- Spring overshoot (~4%) ONLY on success/confirm moments. NO hover-scale on tiles. Everything interruptible, `useReducedMotion()` guarded, transform/opacity/filter only. No transitions on first paint.

## 10. Ambient layer

`components/ui/ambient`: `AmbientGlow` (flat low-alpha accent pills under 80-150px blurs + feTurbulence film-grain at opacity .35 overlay blend) and `FocalOrb` (one glossy sphere max per page). Whisper intensity behind app shell; bold + orb reserved for hero surfaces. Pauses on hidden tabs and reduced-motion. Text over glow stays AA in both themes.

## 11. Typography

EB Garamond for editorial display moments (one per page maximum — a greeting, a manifesto heading). JetBrains Mono for stat labels, captions, and command affordances. System sans for chrome. Body dull, headings bright.

## 12. Both themes, zero jank

Every surface verifies in light AND dark. Animation QA is a shipping gate: no layout shift on entrance, no mount flashes, no orphaned hover states, 60fps compositor-only.

## 13. For agents

Read this file before touching UI. Consume `.sd-*` utilities and shared primitives (`components/ui/explorer`, `components/ui/icons`, `components/ui/ambient`) instead of re-implementing. Two-tier selection and the motion law are non-negotiable. Atomic commits, explicit pathspecs, both-theme verification with evidence.
