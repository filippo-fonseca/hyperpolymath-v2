# Shell Layer Map (scout: opus, 2026-07-12, resumed Claude leg)

Worktree: `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-life-os-refactor` @ `next-codex-spacedrive-ui`.

## 1. `apps/web/app/globals.css` (1438 lines)
- Font tokens L19-21 (`--font-serif/-sans/-mono`).
- Semantic surface/ink tokens L35-41: `--canvas --surface --surface-raised --ink --ink-muted --edge --edge-hud`.
- HUD-cyan palette L44-58: `--hud-cyan[-bright/-dim/-light/-glow/-glow-soft] --hud-cyan-rgb`, glow shadows `--glow-hud-subtle/-medium/-strong`.
- Accent inks L61-65 (`--ink-amber/-sage/-coral/-violet/-blue`). Focus rings L77-79 (`--ring-focus/-doc/-hud`).
- Motion easings L82-85: `--ease-out-quart --ease-in-out-circ --ease-out-back --ease-in-fast`. **No `--duration-*` numeric tokens** — durations are inline everywhere; easings are the only shared motion vocabulary.
- shadcn `--color-*` bridge L88-114 + `--radius: 0.5rem`.
- HUD keyframes L117-336 (hud-corner-breathe, hud-focus-breathe, hud-thinking-sweep, hud-submit-*, hud-scan-reveal, hud-receipt-*, hud-core-rotate-*, shimmer, collapsible-down/up).
- Glass token system L583-610: `:root` L583, `.dark` override L600. `--glass-blur --glass-raise --glass-drop --glass-hi --glass-lo --glass-glow-color --glass-glow(-hover) --glass-border --glass-bg --glass-bg-button --glass-raise-sm --glass-drop-sm`. Dark theming is class-based (`.dark`).
- Reduced-motion L636-640: single global `@media (prefers-reduced-motion: reduce)` block — covers only `.hud-*`, `.receipt-*`, `.wiki-explorer`, view transitions.
- `.glass-tile` L642-658, `.glass-button` L660-676, `.lifeos-glass` L764-772, `.glass-toast` L778-789.
- Sidebar helper classes L687-732: `.sidebar-row`, `.sidebar-row:hover`, `.sidebar-row-active`, `.sidebar-row-active-area`, `.sidebar-ghost-btn`. `.cursor-pointer-always` L1022.
- **`--sd-*` Spacedrive ladder (Wiki Renaissance):** L1374 `:root` light, L1391 `.dark`, L1411 second `.dark` (authoritative). Tokens: `--sd-app --sd-box --sd-dark-box --sd-darker-box --sd-input --sd-line --sd-divider --sd-sidebar-divider --sd-hover --sd-selected --sd-selected-item --sd-active --sd-menu --sd-menu-line --sd-menu-hover --sd-frame --sd-icon-shadow --sd-icon-shadow-opacity --sd-accent --sd-accent-faint --sd-accent-deep --sd-ink --sd-ink-dull --sd-ink-faint`. Dark block remaps `--ink: var(--sd-ink)`, `--ink-muted: var(--sd-ink-dull)` (L1435-36).

## 2. `apps/web/components/shell/**` (20 files, 4323 lines)
| File | Exports | Responsibility / key state |
|---|---|---|
| `AppShell.tsx` (134) | `AppShell` | Root grid: sidebar + main + optional JARVIS panel. Reads `useSplitScreen`, `useTasksExpanded`. Tasks-fullscreen: `AnimatePresence` collapses sidebar wrapper width auto->0 (200ms ease-out-quart, reduced-motion->0). `sidebarAnimating` toggles overflow-hidden mid-anim only. Suppresses side panel on `/today`, `/onboarding`; `/wiki` gets h-full overflow-hidden. |
| `Sidebar.tsx` (684) | `Sidebar`, type `AreaOptimisticDispatch` | The rail. State: collapsed, showArchived, mounted, hovered. Geometry: `<aside>` w-16 (64px) / w-[260px]; inner floating div width tied to `effectiveCollapsed = collapsed && !hovered`. Hover-overlay: collapsed+hover expands inner panel to 260px z-50 raised (page never reflows). Storage: `sidebar-collapsed`, `sidebar-show-archived`. Realtime: `useTableSubscription("areas"|"projects", userId)`; `useQuery(tableKey("areas", userId))` `initialDataUpdatedAt: Date.now()`, `staleTime: Infinity`. `useOptimistic` for areas. Subs: AreasParentLink, AvatarOrInitial, UserChip, SidebarIconRow, SidebarIconButton, SidebarSectionLink. Active = `.sidebar-row-active` / 1px --edge-hud left edge / cyan dot for JARVIS. Footer: archived-eye, ThemeToggle, SFX mute, Settings. |
| `SidebarTree.tsx` (906) | `SidebarTree` | Area->project drag/reorder tree + context menus. `useOptimistic` for projects. @dnd-kit unified DndContext, `PROJECT_PREFIX="project:"`. Actions: reorderAreas/reorderProjects/moveProjectToArea/archive*/unarchive*/deleteProject/updateProject. Archive undo: `useUndoToast` — archive commits immediately, Undo calls unarchive (differs from delayed-commit default; comments L135-160, L704-729). Storage: `useAreaCollapsed` per-area. Ordering: arrayMove + order field. |
| `PersistentNav.tsx` (346) | `PersistentNav` | NAV_ITEMS L64-111 (Search, LifeOS, Tasks, Habits, Training, Nutrition, Journaling, Captures, People, Wiki, Calendar, Graph, JARVIS, Insights, Settings). Active = pathname.startsWith. data-tour attrs. Calendar-disconnected badge. |
| `TopTabBar.tsx` (352) | `TopTabBar` | Back/Fwd arrows, left/JARVIS/Today tabs, split toggle. Storage: `top-tab-last-route`, `top-tab-today-route`. Split pushes JARVIS right pane 70/30. |
| `GlobalHotkeys.tsx` (131) | `GlobalHotkeys` | Cmd+K->focusJarvis; Cmd+[/] nav; Ctrl+1/2/3 tabs; Ctrl+Alt+C/T/E/P quick-create. |
| `NavHistoryProvider.tsx` (167) | `NavHistoryProvider`, `useNavHistory` | In-memory back/fwd stack context. |
| `CommandMenu.tsx` (87) | `CommandMenu` | Command palette Cmd+Shift+K (cmdk). Browse vs compose modes. |
| `CommandMenuContent.tsx` (118), `useQuickCreateActions.tsx` (139), `ShortcutsCheatSheet.tsx` (95), `ThemeToggle.tsx` (99), `NavArrows.tsx` (72), `Breadcrumbs.tsx` (84), `GlobalLoader.tsx` (155), `DailyAutoOpen.tsx` (41), `JarvisSidePanel.tsx` (102), `ProductTour.tsx` (504, keys `hp_tour_pending`/`hp_tour_v1_done`, event `hp:tour-pending`), `Wordmark.tsx` (22), `KiwiAboutDialog.tsx` (85) | — | as named. |

## 3. Wiki Renaissance primitives (d70eac6), `apps/web/components/wiki/**`
**Generic/reusable:** `explorer/ExplorerTopBar`, `explorer/InspectorShell` (+MetaSection/MetaRow), `explorer/ViewToggle` (ExplorerViewMode), `explorer/SortSelect` (ExplorerSortValue), `explorer/ExplorerBreadcrumbs`, `explorer/ExplorerContextMenu*`, `explorer/SelectionRubberBand`, `explorer/EmptyState`, `explorer-views/ExplorerListView`, `icons/FolderIcon` (FolderIconVariant), `icons/PageIcon` (PageIconKind), `journal/JournalRail`, `journal/JournalCards` (JournalCardStagger/JournalTodayCard/JournalTrailCard); `journal/journal-rail.css` styled entirely in --sd-* tokens.
**Wiki-specific (leave alone):** `WikiExplorer.tsx`, `explorer-hooks/*`, `explorer-parts/*`, `explorer-views/ExplorerGridView`, `ExplorerSearchResults`, `preview/*`, `explorer-types.ts`.

## 4. `apps/web/components/spacedrive/**` — does NOT exist yet (confirmed).

## 5. Navigation wiring
- AppShell mounted in `apps/web/app/(app)/layout.tsx` (async RSC), wrapped by NuqsAdapter > QueryProvider > SearchProvider > NavHistoryProvider. Layout fetches getSidebarTree(user.id, false/true), hashtags/projects, avatar, search snapshot. Siblings: GlobalHotkeys, EnterStudioButton, GlobalJarvisDialog, CommandMenu, ShortcutsCheatSheet, Toaster, voice components.
- Single route group `(app)/` with ~26 route dirs + error/loading/template.tsx. Opt-out is behavioral not structural (pages hide chrome via state; /onboarding & /today suppress JARVIS panel; /wiki full-height; Tasks fullscreen hides sidebar via useTasksExpanded).

## 6. Test setup
- `apps/web/vitest.config.mts`, setup `apps/web/vitest.setup.ts`. Scripts: `test` = vitest run, `test:watch`.
- NO tests for shell or wiki explorer. All tests flat in `apps/web/tests/*.test.ts(x)` (~30, JARVIS/voice/studio). RTL/jsdom patterns to copy: `studio-hand-control-onboarding.test.tsx`, `studio-tracking-toggle.test.tsx`, `studio-focus-overlay-paging.test.tsx`.

## 7. Keyboard/palette infra
- CommandMenu (cmdk, Cmd+Shift+K); Cmd+K reserved for JARVIS focus. GlobalHotkeys router. `?` cheat sheet.

## Frozen contracts (shell-owned)
- localStorage: `sidebar-collapsed`, `sidebar-show-archived`, per-area collapse (useAreaCollapsed), `top-tab-last-route`, `top-tab-today-route`, `tasks-expanded` (+event `tasks-expanded-change`), `split-screen-on` (+event `split-screen-change`), `hp_tour_pending`/`hp_tour_v1_done`, SFX pref, theme.
- Realtime/query: `tableKey("areas"|"projects", userId)`; `useTableSubscription("areas"|"projects", userId)` singleton refcounted in Sidebar. Optimistic split: areas in Sidebar, projects in SidebarTree. Archive undo via useUndoToast (immediate-commit variant).
- URL: nuqs via NuqsAdapter; quick-create `?create=now` routes; no shell-owned nuqs keys.
- Events: `hp:tour-pending`, `tasks-expanded-change`, `split-screen-change`.
