```markdown
# apps/web SD-restyle inventory — Scout A

Global font is wired correctly: Space Grotesk is app-wide (`app/layout.tsx`, `globals.css:31-33`), and `--font-serif` **also resolves to Space Grotesk** — so the 507 `font-serif` hits are legacy class names that render correctly, NOT true offenses. The real anti-SD register is `.glass-tile` / `.glass-button` / `lifeos-glass` / `backdrop-blur` / `bg-gradient`, still defined live in `globals.css:657-825` with backdrop-filter blur + cyan glow (the exact thing the SD register bans). Counts: glass-tile ×67, glass-button ×41, backdrop-blur ×27, lifeos-glass ×3, bg-gradient ×3.

## Surface state table

| Surface | Route | State | Key files | Size | Worst offenses |
|---|---|---|---|---|---|
| **Shared dialog primitive** | app-wide | **OLD (foundational)** | `components/ui/dialog.tsx` | — | glass-tile panel + `backdrop-blur-md` overlay `dialog.tsx:56`; every modal in the app inherits it |
| **Shared button primitive** | app-wide | **OLD (foundational)** | `components/ui/button.tsx` | — | `outline`/`secondary` = `glass-button` `button.tsx:44-45`; every secondary button glassy |
| **Insights tile system** | shared | **OLD (foundational)** | `components/insights/tile-style.ts` | — | `NEUMORPHIC_TILE = "rounded-xl glass-tile"` `tile-style.ts:14`; glow stack `:22-23`; used across all /insights surfaces |
| **globals.css glass defs** | app-wide | **OLD** | `app/globals.css` | — | live `.glass-tile`/`.glass-button` blur+glow `:657-689`, `.lifeos-glass` `:795` |
| Habits | /habits | **OLD** | `components/habits/HabitsClient.tsx` | 908 | glass-tile card factory `:71-75`; amber-glow tile `:538`; 9 font-serif |
| Captures | /captures | **OLD** (Wave A) | `CaptureCard.tsx`, `CaptureComposer.tsx`, `CaptureDetailPanel.tsx`, `LinkPreviewCard.tsx`, `HashtagSidebar.tsx` | 495 (client) | glass-tile card `CaptureCard.tsx:249`; composer glow `CaptureComposer.tsx:445`; LinkPreview 5× glass `:74-126` |
| Journaling | /journaling | **OLD** | `JournalCalendar.tsx`, `JournalHistoryFeed.tsx`, `JournalEntryEditor.tsx`, `DayNavigator.tsx` | — | glass-tile calendar `JournalCalendar.tsx:251`; glass-button nav `:279,290` |
| Nutrition | /nutrition + /stats | **OLD** | `NutritionClient.tsx`, `MealSlot*`, `MealsManagerSheet.tsx`, `DailyMacroSummary.tsx`, `ServingPicker.tsx`, `NutritionTargetsForm.tsx`, `DayNavigator.tsx` | 176 (client) | glass-button toolbar `NutritionClient.tsx:108,114`; ~15 glass hits across dir |
| Jarvis console | /jarvis | **OLD** (Wave C) | `JarvisClient.tsx`, `JarvisScrollback.tsx`, `JarvisReceipt.tsx`, `JarvisClarification.tsx` | 264 | glass-tile shell `JarvisClient.tsx:128`; scrollback + receipt glass |
| Jarvis routines/editors | /jarvis/routines, startup | **OLD** | `StartupEditor.tsx`, `PersonalityEditor.tsx`, `RoutineEditor.tsx`, `RoutinesClient.tsx`, `BlockEditor.tsx`, `TriggerBuilder.tsx`, `BlockCard.tsx` | — | glass-tile sections `StartupEditor.tsx:119,137,194`; 4× glass `PersonalityEditor`, `RoutineEditor` |
| Settings (root + subpages) | /settings/* | **OLD** (Wave B) | `app/(app)/settings/page.tsx`, `settings/**`, `mcp-tokens`, `desktop`, `context`, `memory` | 303 | `const tile = "glass-tile p-6…"` `settings/page.tsx:88`; 18 font-serif |
| Onboarding | /onboarding | **OLD** | `components/onboarding-flow.tsx` | 867 | glass-tile violet-glow card `:191-193`; glass-button `:633`; 20 font-serif |
| Graph explorer | /graph | **OLD** | `app/(app)/graph/GraphExplorer.tsx` | 443 | glass-tile factory `:104`; black/40 backdrop-blur overlay `:364` |
| Calendar | /calendar | **OLD** | `CalendarClient.tsx`, `CalendarFilters.tsx`, `EventDetailPanel.tsx`, `EmptyState.tsx` | — | glass-tile card `CalendarClient.tsx:774`; 9 font-serif in EventDetailPanel |
| People | /people | **PARTIAL** | `PersonCard.tsx`, `PersonDetailPanel.tsx` | — | 1 glass hit each; otherwise plain surfaces |
| Pages (wiki page detail) | /wiki/[pageId] | **PARTIAL** | `PageDetailClient.tsx`, `PageProperties.tsx`, `PropertiesManagerModal.tsx`, `PageCoverImage.tsx`, `page-block-editor.css` | — | uses `--sd-` AND glass; 2 backdrop-blur `PageDetailClient`, cover-image 3× glass |
| Projects detail | /projects/[projectId] | **PARTIAL** (mostly SD) | `ProjectDetailClient.tsx` (sd), `ProjectHeader.tsx` | — | lone `bg-…/80 backdrop-blur-sm` `ProjectHeader.tsx:169` |
| Training | /training + /stats | **PARTIAL** (un-tokenized) | `TrainingClient` + `ActivityCard`, dialogs, `stats/*` | ~4900 (dir) | no `--sd-` tokens anywhere; stats cards each 1 backdrop-blur; neutral not glassy but off-register |
| Product tour | overlay | **OLD** | `components/shell/ProductTour.tsx` | — | 2 glass hits |
| Voice status | floating | **OLD** | `components/voice/FloatingJarvisStatus.tsx` | — | 1 glass hit |
| **Sign-in** | /sign-in | **ALREADY-SD** | `app/sign-in/page.tsx` | 99 | clean: `--canvas`/`--edge`/`--surface`, mono labels, no glass/blur/gradient |
| LifeOS | /lifeos | **ALREADY-SD** | `components/lifeos/*`, `WidgetCard.tsx` | — | full `--sd-` + WidgetCard grammar |
| Tasks | /tasks, /today | **ALREADY-SD** | `components/tasks/*` (Kanban, TaskCard, TaskList, Detail, Filters) | — | fully sd-tokenized |
| Wiki explorer | /wiki | **ALREADY-SD** | `WikiExplorer.tsx`, `explorer-parts/*`, `explorer-views/*`, `journal/*`, `ui/explorer/*` | — | sd tokens + explorer chrome |
| Areas | /areas, /areas/[id] | **ALREADY-SD** | `components/areas/AreasTree.tsx`, `areas/[areaId]/page.tsx` | — | sd tokens, clean |
| Sidebar / nav / tabs | shell | **ALREADY-SD** | `Sidebar.tsx`, `SidebarTree.tsx`, `PersistentNav.tsx`, `TopTabBar.tsx` | — | sd tokens |
| Design system page | /design | **ALREADY-SD** (canonical) | `app/design/page.tsx`, `TokenSwatches.tsx` | — | reference surface |

## Biggest lifts (ranked)

1. **Shared primitives — `ui/dialog.tsx`, `ui/button.tsx`, `insights/tile-style.ts`, and the `globals.css` glass defs.** Highest leverage by far: they are inherited app-wide, so every modal, secondary button, and insights tile across *all* surfaces still renders the banned glass register even where the page markup looks migrated. Fix these first (this is Wave D "dialog sweep + dead-CSS excision" territory) — many surfaces snap to SD for free.
2. **Captures cluster** (Wave A #286) — 5 files, self-contained, high daily-use; glass-tile cards + composer glow + LinkPreview.
3. **Settings + Jarvis console/routines** (Waves B/C #287/#288) — large but modular; settings tile constant `:88` and the jarvis editor family are the densest remaining glass concentrations.
4. **Habits + Journaling + Nutrition + Calendar** — mid-size feature surfaces, each still built on the glass-tile card factory; mechanical once primitives land.
5. **Onboarding + Graph** — big single files (867 / 443 lines) with bespoke glow overrides (violet, black/40 blur); lower traffic, defer.
6. **Training** — not glassy but never SD-tokenized (zero `--sd-`); needs a token pass, not a de-glass pass.
```
