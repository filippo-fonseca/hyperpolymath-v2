# Unit brief — `explorer-foundation` (wave 1)

**Read first:** `.bgsd/runs/sesh-1783700667211/SPEC.md` — the Design Doctrine and UX
Architecture there are binding. This unit builds the visual foundation everything else
consumes. Executor: Fable. File-disjoint from sibling wave-1 units: you own
`apps/web/components/wiki/explorer/**` (new), `apps/web/components/wiki/icons/**` (new), and
an additive block in `apps/web/app/globals.css`.

## Goal

The Spacedrive-grade design substrate: CSS tokens, the dimensional SVG icon set, and the
Explorer chrome primitives as a reusable component library — presentational, prop-driven,
no data fetching. Wave 2 will assemble them into the live Explorer.

## Deliverables

1. **Tokens** — append an `/* Explorer (Spacedrive) tokens */` block to
   `apps/web/app/globals.css` with the `--sd-*` ladder from SPEC §Doctrine-1 (dark values
   verbatim under `.dark`; light-mode equivalents at hue 235, low sat, inverted lightness,
   under `:root`). Do not modify existing tokens or glass classes.
2. **Icon set** — `apps/web/components/wiki/icons/`:
   - `FolderIcon` (dimensional layered SVG per SPEC §Doctrine-7; open/closed + drop-target
     highlight variants; sizes 20–80px via props)
   - `PageIcon` (rounded page, folded corner, colored bottom accent bar; `kind` prop:
     `note | daily | doc` variants)
   - Crisp at 16px and gorgeous at 80px. Pure SVG components, no assets.
3. **Chrome primitives** — `apps/web/components/wiki/explorer/` (all `'use client'`,
   presentational, typed props, motion per SPEC §Doctrine-6):
   - `ExplorerTopBar` — slot container: back/fwd buttons (disabled states), breadcrumbs slot,
     search slot, right-side controls slot. `--sd-darker-box` bg, bottom `--sd-divider` border.
   - `ExplorerBreadcrumbs` — segments with `>` separators, last segment `--ink`, each segment
     accepts `onDrop`-ready ref/props (render-prop or `asChild` so wave 2 can wrap dnd-kit).
   - `ViewToggle` — Grid/List segmented pill (`--sd-box` container, `--sd-selected` active).
   - `SortSelect` — Manual · Name · Updated dropdown, Spacedrive menu styling.
   - `ExplorerContextMenu` — styled wrapper over the existing context-menu approach in the
     codebase (check how `WikiFolderMenu`/`WikiPageMenu` render; provide a generic styled
     shell: `--sd-menu` bg, 28px rows, kbd hints right-aligned, 120ms fade+4px Y).
   - `InspectorShell` — right panel shell (~280px, `--sd-box`, left `--sd-line` border),
     slide in/out 220ms `cubic-bezier(0.32,0.72,0,1)`, header slot + scrollable body +
     `MetaRow` (label uppercase `text-[0.7rem]` faint / value right) + `MetaSection` helpers.
   - `SelectionRubberBand` — the translucent cyan marquee rectangle primitive (pure visual;
     geometry driven by props).
   - `EmptyState` — serif editorial empty-state (icon + Garamond line + action slot).
4. **Gallery route for verification** — `apps/web/app/(app)/wiki/_foundation-preview/page.tsx`
   (or a dev-only route) rendering every primitive in both themes so Playwright can verify
   visually. Mark clearly as dev scaffolding; wave 3 coherence-pass may delete it.

## Acceptance criteria

- All primitives render in light AND dark; dark is the hero.
- Accent usage is ONLY `var(--hud-cyan)`; `#2389FF` appears nowhere.
- No Garamond inside chrome primitives (display/empty-state only).
- No data fetching, no server actions, no schema imports.
- `pnpm --filter web build` + typecheck green; Playwright drives the gallery route and
  screenshots grid of primitives without console errors.
