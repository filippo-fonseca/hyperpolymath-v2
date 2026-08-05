# Craft.do web design language — observed from Mobbin (2026-08-04)

Source screens: Craft web app on Mobbin (folders view, All Docs grid/list, doc editor,
Tasks hub, Calendar agenda, notifications panel, glass popovers).

## Macro structure (the shell)
- **Canvas**: one flat, very light warm-gray canvas (~#F6F6F7) covers the whole viewport.
  The sidebar is NOT a boxed panel; it sits directly on the canvas with no border/fill of
  its own. Content region is where elevation happens, not the chrome.
- **The sheet**: the main content (esp. documents) renders as a large white
  rounded-corner sheet (radius ~12-16px) floating on the canvas with a soft diffuse
  shadow, inset from top/right/bottom edges. Hub pages (All Docs, Tasks, Calendar) render
  content directly on the canvas instead, with white cards carrying the elevation.
- **Top bar**: minimal, transparent, part of the canvas. Centered pill search field
  ("Open", cmd-K affordance) ~480px wide, hairline border, white fill. Right side: small
  icon buttons (notifications, help), avatar. Left: window/sidebar toggle. No heavy
  toolbar.
- **Bottom chrome**: tiny utility icons pinned bottom-left (display, export, trash);
  floating "Assistant" pill bottom-right (white pill, hairline border, colored icon,
  shadow-float). Nothing full-width.

## Sidebar
- ~200-220px, quiet. Structure top→bottom: space switcher (tiny logo + name + chevron),
  primary action ("New Document" with + icon), primary nav (All Docs / Tasks / Calendar /
  Imagine / Shared / Templates, small icons, 13px text), then labeled soft sections:
  Starred, Folders (+ hover add), Tags. Section labels are ~11px gray, with empty-state
  hint text in light gray italic.
- Selected state: soft gray pill (slightly darker than canvas), no accent bar, no bold
  color. Hover: even softer pill. Icons monochrome gray, filled only when active.
- Nested folders indent with tiny page icons. Counts/badges: small blue pill.

## Cards
- Doc cards: white, radius ~10-12px, hairline neutral border + very soft shadow; on
  hover, slightly stronger shadow + star affordance. "Today" card gets a highlighted
  border (dark outline) treatment. Cards contain a mini live preview of the page, title,
  breadcrumb/folder + updated time in 11px gray.
- Pinned/task cards: pastel tinted fill (lavender, blue) with matching darker-tint text,
  rounded ~12px, checkbox rows inside.
- Grid: generous 16-20px gutters, 4-5 columns, cards taller than wide (page aspect).

## Editor surface
- Document = white sheet, radius ~16px, floats over canvas; cover images bleed to the
  sheet edge with rounded top corners. Content column centered ~700px. Serif display
  titles (matches our EB Garamond brand). Inline pastel highlight chips for refs.
- Right inspector: separate quiet panel on canvas (Insert/Format/Style/Info tabs),
  small segmented tabs, draggable block palette rows as tiny white cards.
- Table of contents as a left mini-rail inside the editor with tiny icon tabs (toc,
  tasks, attachments, search).

## Overlays / glass
- Popovers and modals are frosted glass: translucent white (~70-80%), heavy backdrop
  blur + saturation, radius ~14-16px, shadow-pop, hairline light border. Examples: Top
  Pages modal, Customize Sidebar, quick-create (+) menu, notifications panel.
- Menus: same glass, rows with 13px text, icons, kbd hints right-aligned.

## Tasks hub (their pattern, relevant to ours)
- Title row: big bold "Tasks" + circled-plus to the left of title.
- Segmented filter chips row: Inbox / Today / Upcoming / All Tasks as white pill chips,
  active chip = tinted blue pill with icon.
- Sections ("Inbox", "Pinned Docs", "Docs With Tasks") as small gray disclosure labels
  with ··· overflow on hover.
- Task rows: bare on canvas (no card per row), checkbox + 13px text + trailing meta
  (date chip, source doc chip, right-aligned). Completed hidden behind a toggle.
- Pinned docs: horizontally larger pastel cards with embedded checkbox lists (mini
  widgets). Empty state: dashed/soft panel with drag-drop hint.

## Calendar (agenda pattern)
- Vertical agenda: left column of small day tiles (gray rounded rect, date + weekday;
  Today = pastel blue tinted tile with blue text), content to the right: daily-note
  preview cards (tiny page thumbnails) + task rows inline. Hover a day → ghost buttons
  "Add Task" / "Create Daily Note". Month headers as small sticky tiles.
- Quick-create (+) near title opens glass menu: "Note for Today ⌘⌥N", "New Task Space".

## Color / type / density
- Neutrals carry the UI; color is data (pastel folder icons, tinted chips, tag dots).
  8-ish pastel families, always pale-bg + darker-ink pairs.
- Text: ~15px body in editor, 13px UI rows, 11px meta/labels; near-black #1a on white.
- Blue is the single interactive accent (active chip, selected day, share button).
- Icons: thin-stroke, small (14-16px), monochrome gray.
- Density: airy but not sparse; sections breathe via 24-32px gaps, rows are 32-36px.

## Dark mode note
- Craft dark: canvas ~#1E1F22, sheets #26272B, glass = translucent dark w/ blur, same
  pastel inks brightened. Elevation via lighter-surface + shadow, not borders.

## What this means vs our current "craft register" (jul-29)
We already have: --shadow-card/-hover/-float/-pop, .craft-card/.craft-glass/
.craft-glass-tile/.craft-sheet/.craft-backdrop, tint-<hue> + tintFor(), bumped radii.
The gap to close is structural, not just cosmetic: canvas-vs-sheet architecture,
quiet borderless sidebar on canvas, centered cmd-K pill, floating assistant pill,
segmented pill filters, agenda-style day tiles, glass popovers everywhere, pastel
data-color discipline, 13px/11px UI type scale.
