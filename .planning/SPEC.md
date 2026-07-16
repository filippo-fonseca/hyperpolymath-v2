# SPEC — Wiki Renaissance: Notion × Drive × Spacedrive

**Run:** sesh-1783700667211 · **Scale:** project · **Base branch:** `next` · **Integration:** `staging`
**Working tree note:** the live checkout of `next` is the worktree at
`/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-routines-test`. Unit worktrees branch from `next`.

## Vision

The Wiki becomes a first-class **Explorer**: the calm density of Spacedrive's file manager,
the content-preview richness of Google Drive, and the editorial soul of Notion. It sets the
visual precedent the rest of the app will follow.

**Core loop:** open Wiki → today's daily page already exists (auto-created, localtime) in its
own Journal rail → below it, a full-width Explorer of folders and pages with real content
previews → drag anything anywhere → click through folders with breadcrumbs + back/forward →
select an item and an Inspector shows you everything about it.

## Non-goals

- NOT rewriting the page editor (BlockNote stays; `PageDetailClient` gets only a width/chrome polish).
- NOT changing the daily-page data model (`pages.dailyDate` + partial unique index stays).
- NOT touching auth, realtime plumbing, or the Kiwi agent tools.
- NOT copying Spacedrive icon assets (FSL-1.1 license — we draw our own SVG set).
- NOT replacing the app-wide cyan accent with Spacedrive blue (see Design Doctrine).

## Design Doctrine (binding for every unit)

1. **Surface palette — the 235°/15% family.** Adopt Spacedrive's near-neutral blue-gray ladder
   as new CSS tokens in `apps/web/app/globals.css` (dark values verbatim; derive light-mode
   equivalents at the same hue with inverted lightness):
   - `--sd-app: hsl(235 15% 13%)` `#1C1D26` (base bg)
   - `--sd-box: hsl(235 15% 18%)` `#272935` (tile) · `--sd-dark-box: hsl(235 15% 15%)`
   - `--sd-darker-box: hsl(235 16% 11%)` `#181920` (chrome bars)
   - `--sd-input: hsl(235 15% 20%)` · `--sd-line: hsl(235 15% 23%)` `#323544` (borders)
   - `--sd-divider: hsl(235 15% 5%)` · `--sd-hover: hsl(235 15% 19%)`
   - `--sd-selected: hsl(235 15% 24%)` `#34374A` · `--sd-active: hsl(235 15% 30%)`
   - `--sd-menu: hsl(235 15% 10%)` `#161721` · `--sd-menu-hover: hsl(235 15% 30%)`
2. **Accent stays cyan.** The app's canonical `--hud-cyan` is the accent, applied with
   Spacedrive's *restraint discipline*: selection borders, active view-toggle, drop targets,
   focus rings — and nothing else. Never introduce `#2389FF`.
3. **Glass = editorial, flat = tool.** Existing `.glass-tile` / `.glass-button` stay for
   editorial containers (Journal rail cards, hero panels). Dense functional chrome (Explorer
   top bar, list rows, inspector, context menus) uses flat `--sd-*` fills. This split is the
   marriage rule; do not glassify the Explorer chrome.
4. **Radii ladder:** panel `10px` · card `8px` · button/input `6px` · pill full. Glass hero
   tiles may keep their larger existing radii.
5. **Typography split.** EB Garamond (`font-serif`) ONLY for display: the Wiki H1, Journal
   rail date headings, empty states. All Explorer chrome (filenames, metadata, breadcrumbs,
   tag pills) uses the existing sans at a shrunk scale: `text-[0.8rem]` rows,
   `text-xs`/`text-[0.7rem]` metadata. Never Garamond inside the grid.
6. **Motion doctrine** (via `motion/react` + CSS):
   - hovers 120ms ease-out background/border only — **no scale transforms on rows/tiles**
   - selection ring: instant (0ms)
   - view-mode switch: 180ms crossfade + 4px Y stagger (10ms/item, cap 24 items)
   - inspector slide: 220ms `cubic-bezier(0.32, 0.72, 0, 1)`
   - context menu: 120ms fade + 4px Y from origin
   - drag ghost: 60% opacity snapshot + cyan count badge
7. **Icons:** custom dimensional SVG set (no external assets). Layered folder (back tab +
   front body, radial gradient `#3A4A6B → #1F2740`, 1px top inner highlight `white/8%`) and
   page icons (rounded page + folded corner + colored bottom accent bar per kind). Lucide
   stays for chrome glyphs.
8. **Shadows shift hue:** any new shadows use `hsl(235 15% 0%)` blacks so glass and flat
   systems share chromatic space.

## UX Architecture (binding)

- **Layout:** Wiki home drops `max-w-3xl` entirely → full width (`px-6`/`px-8`, sensible
  `max-w-[1600px]` guard). Vertical order: Wiki header (serif H1 + actions) → **Journal rail**
  → **Explorer**.
- **Journal rail (daily pages):** its own horizontal section. Today's card first (large, live
  content preview), previous days trailing (smaller cards), a calendar popover for arbitrary
  dates. **Auto-create:** on Wiki mount, if no daily page exists for today (LOCALTIME,
  `format(new Date(), 'yyyy-MM-dd')` client-side), create it silently (no navigation) via the
  idempotent guarded insert. Daily pages NEVER appear in the Explorer below.
- **Explorer model:** Drive-style one-folder-at-a-time drill-down is the primary model.
  Current folder in URL via `nuqs` (`?folder=<id>`) for deep links + real back/forward.
  Top bar: back/fwd chevrons (history), breadcrumbs (each segment a drop target), search
  input (`/` focuses), sort selector (Manual · Name · Updated), view toggle (Grid · List),
  inspector toggle (Cmd+I), New folder / New page.
- **Grid view:** Google-Drive-style preview cards — top thumbnail area rendering ACTUAL page
  content miniature, title bar below (icon + name + meta). Folders as dimensional icon tiles
  with item counts.
- **List view:** 32px Spacedrive rows of the current folder: Name (icon+text) · Kind ·
  Updated · Projects/tags. Selected row = `--sd-selected` bg + 2px cyan left stripe.
- **Selection:** click / Cmd+click / Shift+range; rubber-band select on empty space;
  Esc clears; Cmd+A selects all; arrows navigate (2-D in grid); Enter opens.
- **Drag and drop (dnd-kit, both views):** items → folder tiles/rows, → breadcrumb segments,
  → "up one level" affordance; multi-select drag shows count badge; manual reorder in list
  view when sort = Manual (fractional position keys). Grid DnD is required, not optional.
- **Inspector (right panel, toggleable):** big content preview, then flat metadata rows —
  Kind, Location (breadcrumb), Words, Created, Updated, Projects, Custom fields — plus quick
  actions (Open, Rename, Move, Export, Delete). Multi-select shows "N items" summary.
- **Context menus** on items + empty space, Spacedrive-styled (`--sd-menu`).
- **Empty states / first-run:** designed, not default — serif editorial copy + dimensional icon.

## Data & server contract

- New migration (idempotent, `apps/web/supabase/migrations/`, NEVER touch `drizzle/meta/_journal.json`):
  `position_key text` on `pages` AND `page_folders`. Sort = `(positionKey NULLS LAST, name)`.
- New actions: `reorderItem({ kind: 'page'|'folder', id, afterId?, beforeId?, parentId })`
  using fractional-index keys; `movePagesBulk({ pageIds, folderId })` for multi-select drag.
  Existing `setPageFolder` / `setParentFolder` stay authoritative for reparenting.
- Fractional-index helper in `apps/web/lib/pages/position.ts` (pure, unit-tested; base-62
  midpoint algorithm, no deps).
- TanStack Query + realtime invalidation patterns stay exactly as they are (optimistic patch →
  action → realtime echo).

## Verification bar (every unit)

- `pnpm --filter web build` green from repo root; typecheck green.
- Vitest for pure logic (position keys, dnd resolution, preview extraction).
- Playwright usage verification (full ladder — default on): boot app, drive the real flow.
- No regression to: sidebar tree, Cmd+K search, project pages tab, MCP export, wiki backup cron,
  JARVIS in-document (touchpoint list in the codebase research — see RUN.md).

## Units & waves

| Wave | Unit | Surface | Executor |
|---|---|---|---|
| 1 | `explorer-foundation` — tokens, icons, chrome primitives | new files + globals.css | Fable (design-critical) |
| 1 | `preview-engine` — content preview renderer + cards | new files | Fable (design-critical) |
| 1 | `ordering-backend` — positionKey migration + actions + tests | schema/actions | Opus |
| 2 | `wiki-explorer-rebuild` — the Explorer itself (grid/list/DnD/inspector/keyboard/URL state) | PagesListClient + new | Fable (the monster) |
| 3 | `daily-pages-rail` — Journal rail + auto-create today | Wiki home top section | Opus |
| 3 | `coherence-pass` — ProjectPagesSection mirror, page-detail width/chrome, touchpoint sweep, polish | adjacent surfaces | Opus |

Wave-1 units are file-disjoint by construction. Wave 2 consumes all of wave 1. Wave 3 runs
after the Explorer lands; its two units touch disjoint files (rail = Wiki home top; coherence
= project tab + detail page).
