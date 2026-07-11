# Phase 34: Explorer foundation (bgsd unit explorer-foundation) - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/UNIT-BRIEF.md + .planning/SPEC.md, bgsd run sesh-1783700667211)

<domain>
## Phase Boundary

This phase delivers the **visual foundation** of the Wiki Explorer as a reusable, presentational component library. It is wave 1 of the "Wiki Renaissance: Notion × Drive × Spacedrive" initiative. Wave 2 (`wiki-explorer-rebuild`) will assemble these primitives into the live Explorer; this phase ships NO live data wiring.

In scope (file-disjoint ownership):
- `apps/web/app/globals.css` — additive `--sd-*` token block only
- `apps/web/components/wiki/icons/` — new directory, dimensional SVG icon set
- `apps/web/components/wiki/explorer/` — new directory, chrome primitives
- A dev-only gallery route (e.g. `apps/web/app/(app)/wiki/_foundation-preview/page.tsx`) rendering every primitive in both themes

Out of scope: data fetching, server actions, schema imports, dnd-kit wiring (primitives must only be dnd-*ready*), editor changes, daily-page logic, any modification of existing tokens/glass classes.

</domain>

<decisions>
## Implementation Decisions

### Tokens (SPEC Doctrine-1, binding)
- Append an `/* Explorer (Spacedrive) tokens */` block to `apps/web/app/globals.css` with the `--sd-*` ladder. Dark values verbatim under `.dark`; light-mode equivalents at hue 235, low saturation, inverted lightness under `:root`.
- Dark ladder (verbatim): `--sd-app: hsl(235 15% 13%)`; `--sd-box: hsl(235 15% 18%)`; `--sd-dark-box: hsl(235 15% 15%)`; `--sd-darker-box: hsl(235 16% 11%)`; `--sd-input: hsl(235 15% 20%)`; `--sd-line: hsl(235 15% 23%)`; `--sd-divider: hsl(235 15% 5%)`; `--sd-hover: hsl(235 15% 19%)`; `--sd-selected: hsl(235 15% 24%)`; `--sd-active: hsl(235 15% 30%)`; `--sd-menu: hsl(235 15% 10%)`; `--sd-menu-hover: hsl(235 15% 30%)`.
- Do NOT modify existing tokens or glass classes. Additive only.
- New shadows use `hsl(235 15% 0%)` blacks (Doctrine-8).

### Accent discipline (Doctrine-2, binding)
- Accent is ONLY `var(--hud-cyan)`: selection borders, active view-toggle, drop targets, focus rings. `#2389FF` must appear nowhere.

### Glass vs flat (Doctrine-3, binding)
- Explorer chrome is FLAT `--sd-*` fills. Never glassify chrome primitives. Glass stays for editorial containers only (EmptyState may sit on editorial surface but its chrome is still per-spec).

### Radii ladder (Doctrine-4)
- Panel 10px · card 8px · button/input 6px · pill full.

### Typography (Doctrine-5, binding)
- EB Garamond (`font-serif`) ONLY in EmptyState display copy. All chrome uses existing sans: `text-[0.8rem]` rows, `text-xs`/`text-[0.7rem]` metadata. Never Garamond inside grid/chrome.

### Motion (Doctrine-6, binding; via motion/react + CSS)
- Hovers: 120ms ease-out background/border only; NO scale transforms on rows/tiles.
- Selection ring: instant (0ms).
- Inspector slide: 220ms `cubic-bezier(0.32, 0.72, 0, 1)`.
- Context menu: 120ms fade + 4px Y from origin.
- (View-mode crossfade + drag ghost belong to wave 2, but primitives must not preclude them.)

### Icons (Doctrine-7, binding)
- `FolderIcon`: layered dimensional SVG — back tab + front body, radial gradient `#3A4A6B → #1F2740`, 1px top inner highlight `white/8%`; open/closed + drop-target highlight variants; sizes 20–80px via props; crisp at 16px.
- `PageIcon`: rounded page + folded corner + colored bottom accent bar per `kind` prop (`note | daily | doc`).
- Pure SVG components, no external assets (Spacedrive assets are FSL-licensed — do not copy). Lucide stays for chrome glyphs.

### Chrome primitives (UNIT-BRIEF deliverable 3, binding)
All `'use client'`, presentational, typed props:
- `ExplorerTopBar` — slot container: back/fwd buttons (disabled states), breadcrumbs slot, search slot, right-side controls slot. `--sd-darker-box` bg, bottom `--sd-divider` border.
- `ExplorerBreadcrumbs` — segments with `>` separators, last segment `--ink`; each segment accepts onDrop-ready ref/props (render-prop or `asChild`) so wave 2 can wrap dnd-kit.
- `ViewToggle` — Grid/List segmented pill; `--sd-box` container, `--sd-selected` active.
- `SortSelect` — Manual · Name · Updated dropdown, Spacedrive menu styling.
- `ExplorerContextMenu` — generic styled shell over the codebase's existing context-menu approach (check how `WikiFolderMenu`/`WikiPageMenu` render): `--sd-menu` bg, 28px rows, kbd hints right-aligned, 120ms fade + 4px Y.
- `InspectorShell` — right panel shell ~280px, `--sd-box`, left `--sd-line` border, slide in/out 220ms cubic-bezier(0.32,0.72,0,1), header slot + scrollable body + `MetaRow` (label uppercase `text-[0.7rem]` faint / value right) + `MetaSection` helpers.
- `SelectionRubberBand` — translucent cyan marquee rectangle, pure visual, geometry via props.
- `EmptyState` — serif editorial empty state (icon + Garamond line + action slot).

### Gallery route (UNIT-BRIEF deliverable 4)
- Dev-only route rendering every primitive in both themes so Playwright can verify visually. Clearly marked as dev scaffolding; wave-3 coherence-pass may delete it.

### Claude's Discretion
- Exact light-mode lightness values (must stay hue 235, low sat, inverted lightness, readable).
- Component file naming/structure inside the two new directories; whether to add a barrel `index.ts`.
- Gallery route exact path and theme-toggle mechanism (must render BOTH themes; may render side-by-side sections or a toggle).
- How ExplorerBreadcrumbs exposes drop-readiness (render-prop vs asChild) — pick what fits existing codebase patterns.
- Minor a11y affordances (aria labels, focus-visible rings using --hud-cyan).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Unit contract
- `.planning/SPEC.md` — Design Doctrine 1–8 + UX Architecture (binding for every unit)
- `.planning/UNIT-BRIEF.md` — deliverables 1–4 + acceptance criteria (binding)
- `.planning/bgsd-unit.json` — machine criteria + touched-file ownership

### Codebase surfaces to study (not modify, except globals.css additively)
- `apps/web/app/globals.css` — existing token conventions, `.dark` structure, `--hud-cyan`, glass classes
- `apps/web/components/wiki/` — existing wiki components incl. `WikiFolderMenu`/`WikiPageMenu` context-menu approach
- Existing motion usage (`motion/react`) patterns in `apps/web/components/`

</canonical_refs>

<specifics>
## Specific Ideas

- "Crisp at 16px and gorgeous at 80px" is the icon quality bar; verify at both extremes in the gallery.
- Selected list row treatment (wave 2 will use it): `--sd-selected` bg + 2px cyan left stripe — the token ladder must make this trivially expressible.
- Dark theme is the hero; light must still be correct.
- kbd hints in context menu right-aligned, small, faint.

</specifics>

<deferred>
## Deferred Ideas

- Live Explorer assembly (grid/list views, DnD, keyboard nav, URL state) — wave 2 `wiki-explorer-rebuild`.
- Content preview renderer + cards — sibling wave-1 unit `preview-engine`.
- positionKey migration + reorder actions — sibling wave-1 unit `ordering-backend`.
- Journal rail + daily auto-create — wave 3 `daily-pages-rail`.
- Deleting the gallery route — wave 3 `coherence-pass`.

</deferred>

---

*Phase: 34-explorer-foundation-bgsd-unit-explorer-foundation*
*Context gathered: 2026-07-10 via PRD Express Path (bgsd unit brief)*
