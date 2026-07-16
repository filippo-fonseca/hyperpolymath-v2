# Scout A (Fable cross-check copy) — SD-Restyle Surface Inventory (bgsd/sd-all-features)

Baseline note: `--font-serif` in `globals.css` deliberately resolves to Space Grotesk, so the ~560 legacy `font-serif` classes render correctly and are NOT visual offenses. The true OLD-register markers are `.glass-tile` / `.glass-button` / `backdrop-blur` / `bg-gradient` / `shadow-glow` utilities plus the pre-sd `--ink/--surface/--edge/--canvas` token grammar. SD surfaces use `--sd-*` tokens + WidgetCard v2.

## State table

| Surface | Route | State | Key files | Size | Worst offenses (file:line) |
|---|---|---|---|---|---|
| Sidebar / shell | (app)/layout | ALREADY-SD | components/shell/Sidebar, SidebarTree, TopTabBar, PersistentNav | ~93 sd-tok | clean (ProductTour.tsx:372 glass-tile — tour overlay only) |
| LifeOS | (app)/lifeos | ALREADY-SD | components/lifeos/* (WidgetCard, LifeOsBentoGrid, *Widget) | 94 sd-tok, 0 off | clean |
| Tasks | (app)/tasks | ALREADY-SD | components/tasks/KanbanBoard, TaskCard, TaskList, TaskDetailPanel | 230 sd-tok | minor (4 residual glass in TaskListRow/Overview) |
| Areas | (app)/areas, /[areaId] | ALREADY-SD | components/areas/AreasTree, lifeos/LifeOsAreasShell | 43 sd-tok, 0 off | clean |
| Wiki explorer | (app)/wiki, /[pageId] | ALREADY-SD (mostly) | components/wiki/explorer*, WikiExplorer | 129 sd-tok, 4 off | journal/JournalCards + journal-rail.css glass residue |
| Projects | (app)/projects/[projectId] | PARTIAL | projects/ProjectDetailClient(196), ProjectPagesSection(sd), ProjectHeader | 12 sd / 1 off | ProjectDetailClient still --ink grammar; sections converted |
| Pages/block editor | wiki page bodies | PARTIAL | components/pages/PageDetailClient, page-block-editor.css | 7 sd / 14 off | page-block-editor.css glass panels, PageProperties glass |
| Nutrition | (app)/nutrition(+stats) | OLD | nutrition/NutritionClient(176)+37 files | 148 --ink, 19 off | DailyMacroSummary.tsx:37/57 glass-tile; ServingPicker.tsx:10/180 glass-button; MealSlot, FoodSearch glass |
| Insights (DEV tab) | (app)/insights | OLD | insights/InsightsCharts(245), DevelopmentTabPanel(181), development/*, life/* | 193 --ink, 0 glass | all panels on --ink cards, no sd tokens |
| Captures | (app)/captures | OLD | captures/CaptureCard(557), CaptureComposer(516), CapturesFeed(167) | 46 --ink, 11 off | HashtagSidebar.tsx:94 glass-tile; LinkPreviewCard.tsx:74/91 glass-tile, :101 backdrop-blur; ResurfacingSection glass |
| Training | (app)/training(+stats) | OLD | training/TrainingDayColumn, stats/TrainingStatsClient(194)+stats/* | 194 --ink, 6 off | stats/AdherenceCard.tsx:15, DurationTrendChart.tsx:29, BatchTotalsTable.tsx:26, TrainingStatsClient.tsx:43 glass-tile |
| Habits | (app)/habits | OLD | habits/HabitsClient(908), HabitDialog(257), MiniCalendar | 87 --ink, 3 off | HabitsClient.tsx:71 backdrop-blur, :75/:538 glass-tile |
| Journaling | (app)/journaling | OLD | journaling/JournalEntryEditor(208), JournalHistoryFeed(98), JournalCalendar, DayNavigator | 43 --ink, 9 off | JournalHistoryFeed.tsx:42/64 glass-tile; DayNavigator.tsx:29/46 glass-button |
| Calendar | (app)/calendar | OLD | calendar/CalendarClient(874)+7 files | 45 --ink, 6 off | CalendarClient.tsx:769 backdrop-blur, :774 glass-tile; CalendarFilters.tsx:100/104 |
| Jarvis + Routines | (app)/jarvis, /routines | OLD | jarvis/JarvisScrollback, JarvisClient(128); routines/PersonalityEditor, StartupEditor, RoutineEditor, BlockEditor | 88 --ink, ~15 off | PersonalityEditor.tsx:11/113/164/196 glass-tile; StartupEditor.tsx:13; JarvisClient.tsx:128; JarvisClarification.tsx:56 backdrop-blur |
| Settings (all sub-pages) | (app)/settings(+6 sub) | OLD | settings/page(303), settings-form, ApiKeys/Profile/DangerZone/memory/voice/*, context/desktop/mcp-tokens clients | 134 --ink, 1 off | settings/page.tsx:88 glass-tile; SettingsSectionNav.tsx:66 backdrop-blur; all sections --ink cards |
| People | (app)/people | OLD | people/PeopleClient(195), PersonCard, PersonDetailPanel, PersonEditDialog | 54 --ink, 2 off | glass in PersonDetailPanel/Card |
| Voice modals | shared | OLD | voice/EnableVoiceModal, FloatingJarvisStatus | 21 --ink, 1 off | FloatingJarvisStatus glass |
| Graph | (app)/graph | OLD | graph/GraphExplorer | 20 --ink, 3 off | GraphExplorer glass panels |
| Sign-in | /sign-in | OLD | app/sign-in/page(99), components/sign-in-button | 3 off | uses --ink-muted grammar, no sd |
| Manifesto / Branding / Health | /manifesto, /branding, (app)/health | OLD | app/manifesto/page, branding/page+AssetTile, health/page | 8-12 --ink | --ink grammar, no sd; AssetTile glass |
| Onboarding / Search | (app)/onboarding, /search | OLD (light) | onboarding-flow, search/SearchPageClient | 0 sd | minimal styling, --ink defaults |
| Shared UI primitives | app-wide (every modal/menu) | OLD | ui/button, dialog, command, dropdown-menu, select, sheet, alert-dialog, popover, card, input, textarea | — | button.tsx:39/44/45 glass-button variants; dialog.tsx:56 backdrop-blur, :81 glass-tile; command/dropdown/select/sheet on --ink grammar |

Landing (`components/landing/*`, `/` route) is a separate public marketing surface — heavy gradient/glass by design; part of THIS campaign per user request.

## Biggest lifts (ranked)

1. **Shared UI primitives** (ui/button, dialog, command, dropdown-menu, select, sheet, popover, card, input, textarea). Highest leverage — every dialog/menu/form inherits glass + --ink. Convert first; propagates everywhere.
2. **Insights / DEV tab** (~193 --ink refs; chart-heavy; zero sd adoption).
3. **Captures** (CaptureCard 557 + CaptureComposer 516; 11 glass offenses).
4. **Nutrition** (37 files, 19 glass offenses, 148 --ink).
5. **Calendar** (CalendarClient 874 lines + 7 files, 6 glass).
6. **Habits** (HabitsClient 908 — largest single component) and **Training stats** (glass-tile on every stat card).
7. **Jarvis + Routines** (~15 glass-tile) and **Settings** (7 sub-pages, all --ink).

Quick wins: Wiki journal residue (JournalCards + journal-rail.css), Tasks residual glass (4), Projects detail client, Pages block-editor.css.
