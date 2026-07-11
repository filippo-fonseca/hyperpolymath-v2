# Hyperpolymath UI Brief — the "Spacedrive-clean" register

**Status:** canonical design language as of the Wiki Explorer rebuild (branch `bgsd/wiki-drive-fidelity`, PR #255).
**Purpose:** the reference for restyling every other surface (briefing, tasks, captures, projects, settings, dialogs) onto the same look. Authoritative raw values: `.planning/SPACEDRIVE-TOKENS.md` (mined from Spacedrive's OSS repo). This brief is the *how to apply it* layer.

## 1. The register in one paragraph

Dense, calm, tool-like. A near-black canvas built on a single hue family (HSL 235, 15% saturation) with a strict lightness ladder; hairline borders instead of shadows for structure; ONE accent blue (#2599FF) spent only on selection, focus, primary actions, and drop targets; small type with tight leading; flat 6–8px radii; motion that is quick, subtle, and never springy. It should feel like a precision instrument, not a website. The Journal rail is the one sanctioned exception (editorial glass, Garamond) — deliberate contrast, reading room vs. workshop.

## 2. The token ladder (use the CSS variables, never raw values)

All surfaces sit on the `--sd-*` ladder (defined in `globals.css`; light-mode mirror included):

| Token | Dark value | Role |
|---|---|---|
| `--sd-app` | `hsl(235 15% 13%)` | main canvas |
| `--sd-sidebar` | `hsl(235 15% 7%)` | nav / darker chrome |
| `--sd-box` | `hsl(235 15% 18%)` | cards, tiles, popovers, inputs |
| `--sd-darker-box` | `hsl(235 15% 15%)` | inset wells, secondary bars |
| `--sd-line` | `hsl(235 15% 23%)` | hairline borders (1px, always) |
| `--sd-hover` | ~2–3% L above the surface | hover fill |
| `--sd-selected` | neutral selected backplate | selection background (NOT blue fill) |
| `--sd-accent` | `#2599FF` (`hsl(208 100% 57%)`) | THE accent |
| Ink ladder | 92% / 70% / 55% L | primary / secondary / muted text |

Rules:
- **Structure comes from lightness steps + 1px `--sd-line` borders, not drop shadows.** Shadows only for floating layers (menus, dialogs, drag ghosts): soft, dark, e.g. `0 10px 28px hsl(235 15% 0% / 0.4)`.
- **One accent.** Blue = selected, focused, primary, droppable. Everything else is neutral. If a design wants two accents, it is wrong. (`--hud-cyan` remains the app-wide legacy accent; migrate surfaces to `--sd-accent` as they adopt this register — scope with a wrapper class per surface during transition.)
- Selection pattern (Spacedrive's own): neutral `--sd-selected` backplate on the tile/row, accent used on the *ring* or a chip behind the name — not a blue-flooded card.
- Both themes must read: never leak raw dark values onto light canvas; every new surface checked in dark AND light.

## 3. Type

- UI chrome: the app sans at small sizes — 13px body in dense surfaces, 0.78rem labels, `text-tiny` 0.65rem uppercase micro-labels with `tracking-wide` for section headers (DETAILS / DATES style).
- Numbers/stats/meta: mono where it aids scanning (existing `font-mono-stats` pattern).
- Serif (EB Garamond) is reserved for editorial content surfaces (Journal rail, page reading content) — never for tool chrome.

## 4. Shape & spacing

- Radii: 6px for buttons/inputs/menu items, 8px for cards/tiles/popovers, `rounded-full` only for pills/badges/count chips.
- Grid tiles: ~110px, 8px gap (Explorer standard).
- Toolbars: compact icon buttons (28–32px) grouped in bordered pill clusters; 1px separators.
- Panels (inspector-style): 260px, `border --sd-line`, `bg --sd-box`, sectioned by hairline dividers with uppercase micro-labels.
- The 1px "frame" ring: floating chrome (top bars, overlays) gets a subtle inner 1px light ring (Spacedrive's xor-mask `.frame`) — implemented as `inset 0 0 0 1px white/4%`.

## 5. Motion

- 120–160ms ease-out fades/translates. No spring physics, no bounces, no scale > 1.03.
- List/grid entrance: optional 10ms/item stagger, capped at 24 items.
- Drag: ghost is a compact pill (icon + name + count badge), ~60% opacity; drop targets get accent ring + subtle bg tint; denial = brief shake, never silence.
- Always respect `prefers-reduced-motion` (gate via `useReducedMotion`).

## 6. Sound (optional garnish, never load-bearing)

Tiny synthesized WebAudio cues (no audio assets): drag pickup tick, drop-success soft thock, drop-denied low buzz. Volume ≤ 0.15, user-mutable preference, silent under reduced-motion or when the tab is unfocused. Nothing on hover, nothing on navigation.

## 7. Components vocabulary

- **Menus/popovers** (context menus, `+ New`, slash menu): `bg --sd-box`, 1px `--sd-line`, 8px radius, floating shadow, 6px-radius items with `--sd-hover` fill on highlight, 13px labels, muted 0.7rem shortcut/meta right-aligned, hairline separators, uppercase micro-label group headers.
- **Buttons:** primary = accent bg, white text; secondary = `--sd-box` + `--sd-line` border; ghost = transparent + `--sd-hover` on hover. All 6px radius, 28–32px height in chrome.
- **Inputs:** `--sd-darker-box` well, 1px line, accent ring on focus-visible (2px).
- **Empty states:** dashed 1px `--sd-line` panel, dimensional icon, one line of muted copy, one primary action.
- **Icons:** dimensional/colorful for content objects (folders, docs — the FolderIcon/PageIcon family); flat lucide strictly for chrome actions at 14–16px.

## 8. The exception zones

- **Journal rail / reading content:** editorial glass + Garamond stays. The contrast is intentional.
- Anything terminal/HUD-flavored elsewhere in the app migrates *toward* this register as surfaces are touched (backlog: briefing + tasks first, then captures, projects, settings, dialogs).

## 9. Definition of done for any restyle

1. Only `--sd-*` variables, no raw hex/hsl in components.
2. Dark AND light verified by screenshot.
3. One accent; selection uses the backplate+ring pattern.
4. Hairlines not shadows for structure; 6/8px radii.
5. Motion ≤160ms, reduced-motion respected.
6. Focus-visible rings on every interactive element.
7. No file > ~400 LOC; keep component decomposition.
