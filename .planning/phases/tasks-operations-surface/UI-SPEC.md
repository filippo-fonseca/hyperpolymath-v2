# Tasks operations surface — UI spec

Status: implementation contract for bgsd session `sesh-1783863067187`, Unit 3.

## North star

Tasks is a calm operations deck: dense enough for triage, quiet enough for
repeated daily use. Compose the merged `--deck-*`/`--dur-*` vocabulary and
Spacedrive primitives. Use tonal surfaces and hairlines to express hierarchy;
reserve cyan for focus, active mode, and live drag targets. Avoid marketing
scale headings, gratuitous card boxing, hover glows, and duplicated ambient
energy.

## Surface hierarchy

- Tier 1: `CommandToolbar` with Tasks identity, open/overdue/done readout,
  create task, fullscreen, and compact inbox controls. It wraps at narrow
  widths without hiding primary actions.
- Tier 2: `ModeStrip` for Overview / List / Kanban, followed by the shared
  `DaySwitcher` and a compact filter/action row. Overview is multi-day; List
  and Kanban are scoped to the selected YMD.
- Work area: a persistent, scrollable Inbox/tray plus a central `DeckPanel`.
  Kanban columns use tonal panels and hairlines; the board scrolls internally
  when its columns cannot fit. List rows remain 40px and keyboard reorderable.
- Selection: a useful, focusable bulk-action bar with count, Move to, Delete,
  and Clear. It is visually anchored to the work surface and does not obscure
  the inspector.
- Inspector: the existing Sheet remains the interaction mechanism, but its
  interior reads as a metadata pane: a clear title/action header, grouped
  fields, hairline sections, and full-width touch-safe controls. Compose
  `InspectorShell`/`MetaSection`/`MetaRow` vocabulary where it fits without
  changing the frozen edit/create contracts.

## Type, color, and density

- Page chrome uses the shared operational sans/mono register; task titles keep
  the existing serif voice. The page title is compact (`text-2xl` maximum).
- `--deck-panel`, `--deck-panel-deep`, `--deck-line`, `--deck-divider`,
  `--deck-hover`, `--deck-selected`, `--deck-accent`, and deck ink tokens are
  the default chrome language. Existing semantic amber/coral/sage colors stay
  data meanings only.
- Rows target 40px; controls target at least 32px and remain usable at coarse
  pointers. Panels may use `rounded-[0.5rem]`; cards are flatter and quieter
  than the previous glass-tile treatment.

## Motion and accessibility

Every owned motion-bearing component calls `useReducedMotion()` and maps
reduced motion to static initial/animate/exit values with zero duration. This
includes TaskCard, TaskListRow/List, KanbanColumn/Board, Overview, Overdue,
SelectionBar, CreateInline, and any added animated wrapper. CSS transitions use
`--dur-*` and are disabled by the existing reduced-motion styles where
possible.

Hover-only controls become visible on `focus-within`/`focus-visible` and are
not required for touch: selection buttons, select-all, row menus, and drag
handles have visible or focusable alternatives. Preserve semantic buttons,
inline edit Enter/Escape, Cmd/Ctrl+Enter inspector save, focus hierarchy, and
List PointerSensor + KeyboardSensor reorder.

## Responsive contract

At 320/375/768/1024/1440px and 200% zoom: toolbar rows wrap, the create and
fullscreen actions remain reachable, Inbox can collapse to a labeled full-width
tray without losing tasks, and the inspector remains a usable overlay. Kanban
may scroll inside its surface; the page itself must not gain accidental
horizontal scrolling. Long titles and metadata truncate without clipping.

## Frozen behavior

Do not alter server loading/auth/props/actions, URL params (`view`, `date`,
`task`, `create`, `priority`, `status`, `due`, `project`), all eight task
localStorage keys, `tasks-expanded-change`, query/realtime keys and singleton
subscriptions, optimistic rollback/invalidation/5-second undo, lesno/inbox/
overdue rules, either DnD system, or local-YMD parsing/string comparisons.
