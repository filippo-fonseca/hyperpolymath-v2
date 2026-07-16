# Spacedrive Design-Token Dossier

Source: `spacedriveapp/spacedrive`, branch **`v1`** (the shipped 0.4.x desktop app; this is where the `app` / `app-box` / `ink` / `sidebar` token system the community knows lives). Branch `main` is the v2 rewrite whose tokens moved to an external `@spacedrive/tokens` package (repo `spaceui`, not vendored in-tree); v2 keeps the same token *names* (`app-line`, `app-frame`, `top-bar-blur`) per `apps/tauri/src/index.css` on `main`, and adds named themes (light / midnight / noir / slate / nord / mocha). Everything below is verbatim from source with file paths.

All colors are defined as **HSL triple CSS variables** consumed through Tailwind as `hsla(var(--color-X), <alpha>)`, so every token supports `/opacity` syntax (`bg-app/90`). Definitions: `packages/ui/style/colors.scss`; Tailwind mapping: `packages/ui/style/tailwind.js`.

## 1. Color palette

Master hue variable: `--dark-hue: 235; --light-hue: 235` (a cool indigo-slate; every neutral is hue 235 with 15% saturation). Dark theme is `:root` (default); light theme is `.vanilla-theme`.

### Dark theme (default) — `packages/ui/style/colors.scss`

| Token (Tailwind class) | HSL | ~Hex | Use |
|---|---|---|---|
| `bg-app` | `235, 15%, 13%` | `#1C1D26` | main app/explorer background |
| `bg-app-box` | `235, 15%, 18%` | `#272835` | cards, inspector body, popovers |
| `bg-app-darkBox` | `235, 15%, 15%` | `#21222C` | thumbnail frame fill (behind file previews) |
| `bg-app-darkerBox` | `235, 16%, 11%` | `#181821` | recessed wells |
| `bg-app-lightBox` | `235, 15%, 34%` | `#4A4C64` | raised elements |
| `bg-app-overlay` | `235, 15%, 17%` | `#252632` | overlays |
| `bg-app-input` | `235, 15%, 20%` | `#2B2D3B` | inputs |
| `bg-app-focus` | `235, 15%, 10%` | `#16161D` | focus wells |
| `border-app-line` | `235, 15%, 23%` | `#323343` | THE hairline border everywhere |
| `border-app-divider` | `235, 15%, 5%` | `#0B0B0F` | heavy dividers |
| `bg-app-button` | `235, 15%, 23%` | `#323343` | gray buttons |
| `bg-app-hover` | `235, 15%, 25%` | `#363849` | hover fill |
| `bg-app-selected` | `235, 15%, 26%` | `#383A4C` | selected/pressed fill (top bar active, pills) |
| `bg-app-selectedItem` | `235, 15%, 18%` | `#272835` | **grid-tile selection backplate** (subtle, NOT accent) |
| `bg-app-active` | `235, 15%, 30%` | `#414358` | active/pressed |
| `shadow-app-shade` | `235, 15%, 0%` | `#000000` | shadow color (used at 5–50% alpha) |
| `app-frame` | `235, 15%, 25%` | `#363849` | 1px inner "frame" ring color (see §2) |
| `app-slider` | `235, 15%, 20%` | `#2B2D3B` | slider track |
| `app-explorerScrollbar` | `235, 20%, 25%` | `#33354D` | explorer scrollbar thumb |

### Accent (Spacedrive blue)

| Token | HSL | Hex |
|---|---|---|
| `accent` (DEFAULT) | `208, 100%, 57%` | `#2599FF` |
| `accent-faint` | `208, 100%, 64%` | `#47A9FF` (hover on accent buttons) |
| `accent-deep` | `208, 100%, 47%` | `#0080F0` |

Legacy scale kept in `tailwind.js`: `primary.500 #2599FF`, `600 #0081F1`, `700 #0065BE`, plus a `gray` scale (`500 #303544`, `550 #20222d`, `600 #171720`, `650 #121219` … `950 #030303`).

### Ink (text ladder)

| Token | HSL (dark) | ~Hex | Role |
|---|---|---|---|
| `text-ink` | `235, 35%, 92%` | `#E3E5F2` | primary (note the 35% sat — slightly blue-tinted white) |
| `text-ink-dull` | `235, 10%, 70%` | `#ABACBA` | secondary (item size captions, metadata labels, top-bar icons) |
| `text-ink-faint` | `235, 10%, 55%` | `#818398` | muted/placeholder |

### Sidebar (its own darker family)

| Token | HSL (dark) | ~Hex |
|---|---|---|
| `bg-sidebar` | `235, 15%, 7%` | `#0F1015` (darkest surface in the app; on macOS rendered at `bg-opacity-[0.65]` over vibrancy) |
| `bg-sidebar-box` | `235, 15%, 16%` | `#23242F` |
| `border-sidebar-line` | `235, 15%, 23%` | `#323343` |
| `text-sidebar-ink` | `235, 15%, 92%` | `#E8E8EE` |
| `text-sidebar-inkDull` | `235, 10%, 70%` | `#ABACBA` |
| `text-sidebar-inkFaint` | `235, 10%, 55%` | `#818398` |
| `sidebar-divider` | `235, 15%, 17%` | `#252632` (also the TOP BAR bottom border) |
| `sidebar-button` | `235, 15%, 18%` | `#272835` |
| `sidebar-selected` | `235, 15%, 24%` | `#343646` (active nav item uses this at `/40`) |
| `sidebar-shade` | `235, 15%, 23%` | `#323343` |

### Menu (context menus / dropdowns)

`menu` `235,15%,10%` (#16161D), `menu-line` `235,15%,14%`, `menu-ink` `235,25%,92%`, `menu-faint` `235,5%,80%`, `menu-hover` `235,15%,30%`, `menu-selected` `235,5%,30%`, `menu-shade` `235,5%,0%`.

### Light theme (`.vanilla-theme`, same file)

hue 235 at ~5% sat: `app 235,5%,100%`, `app-box 98%`, `app-darkBox 97%`, `app-line 90%`, `sidebar 96%`, `ink 235,5%,25%`, `ink-dull 40%`, `ink-faint 60%`; accent identical (`208,100%,57%`, faint `67%`).

### Selection colors — the two-tier rule

- Tile/row selection **backplate**: `bg-app-selectedItem` (neutral, barely lighter than bg) — `Explorer/View/GridView/Item/index.tsx`.
- Selected item **label**: `bg-accent` chip behind the filename text (white text in light mode) — `Explorer/View/RenamableItemText.tsx`: `(selected || highlight) && ['bg-accent', !isDark && 'text-white']`.
- Rubber-band drag-select rectangle (`interface/app/style.scss` `.selecto-selection`): `border-color: hsla(var(--color-accent)); background-color: hsla(var(--color-accent), 0.2); rounded`.

## 2. Radii, shadows, borders

- Radii are stock Tailwind: tiles `rounded-lg` (8px) for the thumb backplate, `rounded-md` (6px) for buttons/pills/name chips, `rounded` (4px) for breadcrumb segments, `rounded-sm` (2px) on thumbnail frames.
- **Thumbnail "frame"** (`Explorer/FilePath/useFrame.tsx`): `rounded-sm border-2 border-app-line bg-app-darkBox` + a checkerboard for transparency (`Thumb.module.scss`: 45deg linear-gradients of `#16161b` — light mode `#e2e2e2` — at `background-size: 20px 20px`).
- **`.frame` utility** (`interface/app/style.scss`): a 1px inner border drawn with a `::before` + xor mask, `padding: 1px; border-radius: inherit; background: app-frame` — Spacedrive's signature crisp inner hairline on media previews. Preserved verbatim in v2 (`apps/tauri/src/index.css` `@utility frame`).
- Shadows are quiet: inspector card `shadow-app-shade/10`; drag ghost thumbs `shadow-md shadow-app-shade/50` (dark) or `/25` (light); landing `.cool-shadow: rgb(0 0 0 / 9%) 0px 3px 12px` (`packages/ui/style/style.scss`).
- Blur utilities (`packages/ui/style/style.scss`): `.top-bar-blur { backdrop-filter: saturate(120%) blur(18px); border-color: app-line/50 }`, `.backdrop-blur` 18px, `.navbar-blur` 28px.

## 3. Typography

- Families (`packages/ui/style/tailwind.js`): `sans` = Tailwind default stack (Inter is loaded in-app); `plex` = `'IBM Plex Sans', ...`. **Buttons and sidebar nav use `font-plex font-medium tracking-wide`** — that's the distinctive slightly-wide UI text.
- Custom size scale: adds **`text-tiny: .65rem` (10.4px)** and shrinks `sm` to **`.80rem` (12.8px)**; `xs .75rem`, `base 1rem`.
- Usage: grid item name `text-sm font-medium` (via RenamableItemText); size caption `text-tiny text-ink-dull`; sidebar links `text-sm font-medium font-plex tracking-wide`; section titles / inspector `MetaTitle` `text-xs font-bold text-ink`; metadata rows `text-xs text-ink-dull`; path bar `text-[11px] text-ink-dull`; thumbnail extension badge `text-[9px] font-semibold uppercase`.

## 4. Explorer grid item

Files: `interface/app/$libraryId/Explorer/View/GridView/index.tsx`, `.../GridView/Item/index.tsx`, defaults in `Explorer/store.ts`.

- Defaults: `gridItemSize: 110` px, `gridGap: 8` px, `showBytesInGridView: true`. Grid `PADDING = 12`; virtualized via `@virtual-grid/react`, `columns: 'auto'`.
- Item height = `gridItemSize + itemDetailsHeight` where details = `44` (name only) / `60` (with tags row) `+ 20` if size shown.
- Tile anatomy (top→bottom):
  1. Thumb cell: `mb-1 flex aspect-square items-center justify-center rounded-lg`, gets `bg-app-selectedItem` when selected or drop-target. Thumb inside has `px-2 py-1`; cut items `opacity-60`; hidden files `opacity-50`.
  2. Name: `RenamableItemText` centered, `lines={2}` truncation (react-truncate-markup), `font-medium`, selected → `bg-accent` rounded chip.
  3. Size caption: `truncate rounded-md px-1.5 py-px text-center text-tiny text-ink-dull` (e.g. "3.1 MB").
  4. Tag dots: up to 3, `size-2.5 rounded-full border border-app` (bg border makes them read as punched-out), `backgroundColor: tag.color`, overlapped by `right: i * 4` px.
- Selection ring: there is **no ring** — selection = neutral backplate + accent name chip (see §1).
- List view: row height from icon-size setting; path bar `PATH_BAR_HEIGHT = 32`.

## 5. Icon system

Package `@sd/assets` (`packages/assets/`): **pre-rendered PNGs** (dimensional, 3D-ish, angled) per concept — `Folder.png`, `Archive.png`, `Audio.png`, `Video.png`, `Database.png`, `Album.png`, plus `_Light` variants for light mode and `-20` small variants. Also brand icons (AmazonS3, BackBlaze…) and `packages/assets/svgs/ext/` = hundreds of per-extension SVG glyphs.

- Resolution logic (`packages/assets/util/index.ts` `getIcon`): dir → `Folder`/`Folder_Light`; else try `${kind}_${ext}` (e.g. `Video_mp4`) → kind → `Document` fallback.
- **Layered icons** (`Explorer/FilePath/LayeredFileIcon.tsx`): for kinds `Document | Code | Text | Config`, an extension SVG badge is composited over the base PNG at `height/width 50%`, positioned bottom-right (`items-end justify-end pb-4 pr-2`) or centered with `pt-[18px]` for Code/Config. This is the colored per-filetype document-with-badge look.
- Generic UI `<Icon name size>` component: `interface/components/Icon.tsx` (plain `<img>`, `pointer-events-none`).
- Thumbnails of real images/videos get the §2 frame; videos get computed letterbox "black bars" plus an extension badge: `rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold uppercase text-white opacity-70` (`FilePath/Thumb.tsx`).
- UI glyph icons are **Phosphor** (`@phosphor-icons/react`), top bar at `size 18, weight 'regular'`.

## 6. Top bar anatomy

Files: `interface/app/$libraryId/TopBar/{index,NavigationButtons,TopBarButton,TopBarOptions}.tsx`, `Explorer/TopBarOptions.tsx`, `Explorer/ExplorerPathBar.tsx`.

- Container: absolute, `z-50`, **`h-12`** row, `px-3.5 gap-3.5`, `bg-app/90` + `.top-bar-blur` (saturate 120% blur 18px), bottom border `border-sidebar-divider`. Layout = left (nav + breadcrumbs) / center (search) / right (tools), portal-driven.
- Back/forward: Phosphor `ArrowLeft/ArrowRight size 14 weight bold` inside `m-[4px]`, as a **joined segmented pair** — left button `rounded-l-md rounded-r-none`, right `rounded-l-none rounded-r-md`, `mr-px` gap.
- `TopBarButton` (cva): `text-md relative mr-px flex border-none !p-0.5 font-medium text-ink transition-colors duration-100 hover:bg-app-selected radix-state-open:bg-app-selected`; `active: !bg-app-selected`; rounding `none|left|right|both`.
- Right cluster (`TOP_BAR_ICON_*` consts): icons `size 18 weight regular`, class `m-0.5 text-ink-dull`. Order: **view toggles** (grid `SquaresFour`, list `Rows`, media `MonitorPlay`) as one segmented group with active state; then Spacedrop / Key manager / Tag; then Options-panel (`SlidersHorizontal`, opens popover `min-w-[250px] max-w-[500px]`) and Inspector toggle (`SidebarSimple` mirrored `-scale-x-100`, `weight='fill'` when open). Group separator: `mx-4 h-[15px] w-0 border-l` `border-zinc-600` (dark) / `border-zinc-300`.
- **Tab pills row** (shows at 2+ tabs): `h-9 text-xs text-ink-dull divide-x divide-sidebar-divider`; each tab `min-w-40 px-8 centered duration-[50ms]`; active `text-ink`; inactive `top-bar-blur border-t border-sidebar-divider bg-sidebar/30 text-ink-faint/60 hover:bg-app/50`; close X appears on hover (`opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-app-selected`); `Plus weight bold size 14` add button.
- **Path bar** (bottom of explorer, height 32): `border-t border-t-app-line bg-app/90 backdrop-blur-lg px-3.5 text-[11px] text-ink-dull`; each crumb = `flex items-center gap-1 rounded p-1` with folder icon 16px + name, `hover:bg-app-button/70` (dark), separated by `CaretRight weight bold size 10`.

## 7. Inspector panel

File: `interface/app/$libraryId/Explorer/Inspector/index.tsx`.

- `INSPECTOR_WIDTH = 260` px; sticky below top bar (`!top-[40px]`).
- **Preview area**: `relative mb-2 aspect-square px-2` above the card; multi-select fans out the last 3 thumbs (z-30 76% / z-20 80% rotate -5deg / z-10 84% rotate 7deg, `shadow-md shadow-app-shade`).
- **Card**: `flex flex-col overflow-hidden rounded-lg border border-app-line bg-app-box py-0.5 shadow-app-shade/10`. Empty state: `h-[390px]` centered `text-sm text-ink-dull` "Nothing selected".
- Name: RenamableItemText `!text-base !font-bold !text-ink`, `px-2 pb-1 pt-2`, click-to-rename.
- Action icon row: `mx-3 mt-1 flex space-x-0.5` of `Button size="icon"` (favorite heart, `Lock`, `Link` at `size-[18px]`).
- Divider: `@sd/ui` `Divider` = `bg-app-line/60 my-1 h-[1px] w-full` (`packages/ui/src/Divider.tsx`).
- Sections: `MetaContainer = flex flex-col px-4 py-2 gap-1`; `MetaTitle = text-xs font-bold text-ink`.
- **Label–value rows** (`MetaData`): `flex text-xs text-ink-dull` + Phosphor icon `weight bold mr-2`; label `flex-1 whitespace-nowrap`; value right side `truncate text-ink`, `--` when empty. Rows: Size (Cube), Created (Clock), Modified (Eraser), Indexed (Barcode), Accessed (FolderOpen), Path (copies on click); bottom section Content ID (Snowflake), Checksum, Object ID (Hash).
- Pills: `InfoPill = inline border border-transparent px-1 text-[11px] font-medium shadow shadow-app-shade/5 bg-app-selected rounded-md text-ink-dull` (kind + extension); tag pills same but `backgroundColor: tag.color + 'CC'` and `!text-white`; `PlaceholderPill` ("Add Tag") = dashed `border-app-active` transparent pill, hover `text-ink-faint border-ink-faint`.
- Scrollbar: `.inspector-scroll` 5px wide thumb `bg-app/70`, opacity 0 until container hover (`interface/app/style.scss`).

## 8. Motion / interaction

- Transitions are fast and color-only: buttons `transition-colors duration-100`; top-bar tabs `duration-[50ms]`; top bar bg `duration-250 ease-out`. **No hover scale on explorer tiles.**
- Custom easing library in `tailwind.js` (`in/out/in-out` × sine/quad/cubic/quart/quint/expo/circ/back, e.g. `out-back: cubic-bezier(0.34, 1.56, 0.64, 1)`); sidebar collapse uses `[0.25, 1, 0.5, 1]` (Framer Motion, `SidebarLayout/index.tsx`).
- Tooltips: 0.6s `cubic-bezier(0.16, 1, 0.3, 1)` 10px slide+fade per side; dialogs: overlay fade 200ms, content `slide-top 0.3s cubic-bezier(0.215, 0.61, 0.355, 1)` (`interface/app/style.scss`).
- **Drag ghost** (`Explorer/DragOverlay.tsx`): snaps to cursor +12px offset, `animate-in fade-in duration-300`; vertical stack of up to 8 rows (32px framed thumb + accent-highlighted name); >7 items fade the tail (`opacity-90/50/10`); count in a `rounded-full bg-accent text-sm text-white h-6 min-w-[24px]` badge; drop animation disabled.
- Drop-target feedback: same `bg-app-selectedItem` backplate + name `highlight` as selection.
- Sidebar: `mask-fade-out` on the scroll area (fades content to transparent over the last ~40–50px); collapsed sidebar floats as `rounded-md border border-app-line bg-sidebar shadow` and slides in via hover/focus.
- Misc: `.wiggle` (rotate ±1deg, 200ms infinite) for tag-assign mode; `.icon-with-shadow` SVG filter; explorer scrollbar rounded-6px `bg-app-explorerScrollbar` thumb.

## Quick-start CSS variable block (dark)

```css
:root {
  --color-accent: 208 100% 57%;        /* #2599FF */
  --color-accent-faint: 208 100% 64%;
  --color-accent-deep: 208 100% 47%;
  --color-ink: 235 35% 92%;
  --color-ink-dull: 235 10% 70%;
  --color-ink-faint: 235 10% 55%;
  --color-app: 235 15% 13%;
  --color-app-box: 235 15% 18%;
  --color-app-dark-box: 235 15% 15%;
  --color-app-line: 235 15% 23%;
  --color-app-hover: 235 15% 25%;
  --color-app-selected: 235 15% 26%;
  --color-app-selected-item: 235 15% 18%;
  --color-app-frame: 235 15% 25%;
  --color-sidebar: 235 15% 7%;
  --color-sidebar-divider: 235 15% 17%;
  --color-sidebar-selected: 235 15% 24%;
  --color-menu: 235 15% 10%;
}
```

### Source index
- `packages/ui/style/colors.scss` (v1) — all HSL tokens, dark + vanilla themes
- `packages/ui/style/tailwind.js` (v1) — token→Tailwind mapping, fonts, text-tiny scale, easing curves, legacy primary/gray hex
- `packages/ui/style/style.scss`, `interface/app/style.scss` (v1) — blur, `.frame`, selecto, scrollbars, keyframes
- `interface/app/$libraryId/Explorer/…` (v1) — GridView, Item, RenamableItemText, Thumb(+module.scss), useFrame, store (110px/8px defaults), DragOverlay, ExplorerPathBar, Inspector, TopBarOptions
- `interface/app/$libraryId/TopBar/…` (v1) — TopBar, NavigationButtons, TopBarButton, TopBarOptions
- `packages/ui/src/{Button,Divider}.tsx` (v1); `packages/assets/util/index.ts`, `Explorer/FilePath/LayeredFileIcon.tsx` (icons)
- `apps/tauri/src/index.css` (main/v2) — confirms token names + `frame`/`top-bar-blur` utilities carry into v2; v2 palette values live in external `@spacedrive/tokens` (spaceui repo)
