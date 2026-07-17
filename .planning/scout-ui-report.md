# Scout report: UI surface + design canon for the projects timeline

VERDICT: The binding constraint is data, not layout — `projects.startDate` is nullable, is never set for class projects, and is not even selected by the area-detail RSC query, so a timeline has no reliable left anchor until a `projectEffectiveStartISO()` is defined to mirror the existing `projectEffectiveEndISO()`.

SUMMARY:
- Sidebar pills live in `components/shell/PersistentNav.tsx`; "Areas" is deliberately NOT a pill — it is a `SectionHeader` whose label links to `/areas`, with `SidebarTree` nested under it.
- The one real segmented-control precedent is `components/ui/explorer/ViewToggle.tsx`, hard-typed `"grid" | "list"`; it must gain a `"timeline"` member or be generified.
- Best toggle seam is the area detail page: drop the toggle into the filter row at `AreaProjectList.tsx:99` and branch the render at `AreaProjectList.tsx:128`.
- `projects` has exactly two date fields: `startDate` and `endDate`, both nullable drizzle `date` (ISO `YYYY-MM-DD` strings, not timestamps).
- Date *editing* UI exists (native `<input type="date">` in the settings/create dialogs); date *display* UI does not exist anywhere in `components/projects/**`.
- `CalendarGrid.tsx` is the reusable prior art: column derivation, sticky date headers, today wash, and a `ResizeObserver`-backed scroll-to-now that ports directly from `scrollTop` to `scrollLeft`.
- `JournalRail.tsx:180` is the only horizontal scroll-snap rail in the repo and already solves "today card + scroll into view".
- No virtualization library exists anywhere in `apps/web` — introducing one is a new dependency decision.
- Persistence idiom to follow is `lifeos:view` (`LifeOsCanvas.tsx:38-65`): default on SSR, read in a mount effect, write inside the setter.
- Design canon: Space Grotesk for all UI, JetBrains Mono for date headers, EB Garamond banned; cyan `--sd-accent` is always the primary series; `width` animation is banned (§14/§16) so bars zoom via `scaleX`.

---

## 1. Sidebar

**Files.** `apps/web/components/shell/Sidebar.tsx` (738L, shell + collapse + optimistic areas state), `apps/web/components/shell/PersistentNav.tsx` (374L, the nav pills), `apps/web/components/shell/SidebarTree.tsx` (944L, area/project rows + dnd-kit reorder).

**Pill grammar.** `NavRow` at `PersistentNav.tsx:124`, driven by the `NavItem` interface (`PersistentNav.tsx:73-82`). Two icon registers: `dimensional` (18px custom icons from `@/components/ui/icons`, used for nouns) takes precedence over `icon` (16px **lucide**, used for verbs). The item arrays are `MAIN_ITEMS` (`PersistentNav.tsx:85`) and `SYSTEM_ITEMS` (`PersistentNav.tsx:114`).

**Active state** — prefix match, `PersistentNav.tsx:135`, with a shared `layoutId` backplate that slides between rows (reduced motion falls back to a static span):

```tsx
const active = !!pathname?.startsWith(item.href);
```
```tsx
<motion.span
  layoutId="nav-active-pill"
  className="absolute inset-0 rounded-[6px] bg-[color-mix(in_oklch,var(--sd-selected)_40%,transparent)]"
```

Row tokens `SB_ROW` / `SB_ROW_ACTIVE` / `SB_GHOST` / `SB_FOCUS` are exported from `Sidebar.tsx:76-85`. Tree rows instead use exact match: `pathname === '/areas/${area.id}'` (`SidebarTree.tsx:428`), `pathname === '/projects/${project.id}'` (`SidebarTree.tsx:625`).

**One pill verbatim** (`PersistentNav.tsx:241-245`):
```tsx
return (
  <Link href={item.href} className="w-full" data-tour={tourKey}>
    {inner}
  </Link>
);
```

**Collapsed rail** — `Sidebar.tsx:113-138`. `collapsed` persists to `localStorage["sidebar-collapsed"]`, read inside a `useEffect`; `!mounted && "invisible"` prevents the flash. The load-bearing subtlety is hover-peek:
```tsx
const effectiveCollapsed = collapsed && !hovered;
```
The outer `aside` width tracks the real `collapsed` (`w-14` / `w-[230px]`, `Sidebar.tsx:180`) while the inner div tracks `effectiveCollapsed` and floats as a `z-50` overlay, so hover-expanding never shifts page layout.

**Does "Areas" exist?** Yes, but not as a nav pill. It is a `SectionHeader` whose label is the `/areas` link, with `SidebarTree` as children (`Sidebar.tsx:214-259`), deliberately excluded from `MAIN_ITEMS` (see the comment at `PersistentNav.tsx:109-110`). In the collapsed rail `SectionHeader` degrades to a bare hairline (`Sidebar.tsx:406`), so `/areas` is unreachable from a pinned rail — worth knowing if the timeline is meant to be sidebar-reachable.

## 2. Areas page

**Routes.** Index: `apps/web/app/(app)/areas/page.tsx` (48L, RSC → `getSidebarTree(user.id, true)`; filters archived *areas* server-side but keeps archived *projects* so client toggles stay pure) → `AreasPageClient.tsx` → `AreasTree.tsx`. Detail: `apps/web/app/(app)/areas/[areaId]/page.tsx` (92L) → `AreaProjectList.tsx`.

**Views today.** Two surfaces, neither of which is a view-mode toggle:
- `/areas` — a single hard-coded SVG tree (`AreasTree.tsx:73`): avatar root, measured trunk/elbow connectors via `ResizeObserver` (`AreasTree.tsx:147-241`), areas as cards, projects as chips. Below it a flat "Manage areas" list (`AreasPageClient.tsx:70-107`). No alternate view exists.
- `/areas/[areaId]` — a responsive card grid (`AreaProjectList.tsx:128`): `grid-cols-1 @sm/main:grid-cols-2 @2xl/main:grid-cols-3`.

**Toggle precedents, in increasing order of fitness.**
1. `ChipButton` (`AreasTree.tsx:401`) — independent `aria-pressed` chips under a mono "View" eyebrow (`AreasTree.tsx:247-274`). Boolean toggles, not a segmented control.
2. `TabButton` (`AreaProjectList.tsx:198`) — Active/Archived tabs with counts. Mutually exclusive, but styled as bare text.
3. **`ViewToggle` (`apps/web/components/ui/explorer/ViewToggle.tsx:9`) — the real precedent.** A proper segmented control: `<fieldset>` + `sr-only` `<legend>`, `aria-pressed` buttons, lucide icons, `--sd-*` tokens. Currently hard-typed `"grid" | "list"` (line 7) and used only by the wiki explorer. `components/ui/tabs.tsx` (Radix) exists but is unused on these surfaces.

**Where a "view by date" toggle slots in.**
- **Area detail (best fit).** `AreaProjectList.tsx:83-115` is the existing tab + filter row; the toggle goes beside the `hideClasses` chip at **`AreaProjectList.tsx:99`**, and the render branches at **`AreaProjectList.tsx:128`** (the `<ul className="grid ...">`). Decisive advantage: the server already selects `endDate`, `semesterTerm`, `semesterYear` (`app/(app)/areas/[areaId]/page.tsx:48-51`), and `isPast` / `isProjectExpired` (`AreaProjectList.tsx:39-42`) already reason over dates. **Caveat: `startDate` is NOT selected** — it must be added to the select at `page.tsx:41-52` and to the `AreaProject` interface (`AreaProjectList.tsx:14-25`).
- **Areas index.** The controls strip at `AreasTree.tsx:247` is the natural anchor, but `SidebarArea['projects']` would need date fields threaded through `getSidebarTree` — a wider change.

## 3. Projects UI

**Schema** (`apps/web/lib/db/schema.ts:162`) — exactly two date fields on `projects`, both nullable drizzle `date` (ISO `YYYY-MM-DD` strings, not timestamps):
```ts
startDate: date("start_date"),
endDate: date("end_date"),
```
(`schema.ts:176-177`), plus `archivedAt` (178) and the class fields `semesterTerm` / `semesterYear` (183-184). There is no due date on projects; `dueDate` is a **tasks** field (`schema.ts:220`).

**Cards/rows.** Area grid cards inline at `AreaProjectList.tsx:129-191`; sidebar rows at `SidebarTree.tsx:624+`; tree chips at `AreasTree.tsx:583-609`; also `components/pages/ProjectPill.tsx` and `components/shared/ProjectMultiSelect.tsx`.

**Detail view.** `app/(app)/projects/[projectId]/page.tsx` (109L, RSC hydrating the canonical `['projects', userId]` key) → `components/projects/ProjectDetailClient.tsx` → `ProjectHeader.tsx` + `ProjectTasksSection` / `ProjectCapturesSection` / `ProjectPagesSection`.

**Date UI — editing exists, display does not.**
- Edit: `ProjectSettingsDialog.tsx:143-170`, two native date inputs with a dirty guard (line 76) and `""`→`null` coercion (81-82):
```tsx
<Input id="ps-start" type="date" value={startDate}
  onChange={(e) => setStartDate(e.target.value)} className="h-9" />
```
- Create: `ProjectCreateDialog.tsx:257,263`, same pattern via react-hook-form `register`.
- Display: none. `ProjectHeader.tsx` only passes `startDate`/`endDate` down to the settings dialog (`ProjectHeader.tsx:388-389`) and never renders them. Grepping `toLocaleDateString` / `formatDate` / `date-fns` across `components/projects/**` returns zero hits. The only date-derived UI anywhere is the "Ended" badge (`AreaProjectList.tsx:160-164`), computed from `isProjectExpired`.

**Date logic lib.** `apps/web/lib/projects/archive-status.ts` — `todayISODate()`, `semesterEndISO()`, `projectEffectiveEndISO()`, `isProjectExpired()`. `projectEffectiveEndISO` is the right end anchor to reuse: classes resolve to their semester end, everything else to `endDate`. **There is no `projectEffectiveStartISO` counterpart**, so the timeline must define a start anchor for class projects (semester start, or fall back to `createdAt`).

## 4. Existing time-based UI

**Calendar.** `apps/web/app/(app)/calendar/page.tsx` — RSC; server "today" at `page.tsx:102-105`:
```ts
const now = new Date();
// Monday-start (RESEARCH Open Q 1 — hard-coded).
const weekStart = startOfWeek(now, { weekStartsOn: 1 });
```
`apps/web/components/calendar/CalendarClient.tsx` (874L) orchestrates; its view/date state is plain `useState`, **not persisted and not in the URL** (`CalendarClient.tsx:143-144`). `apps/web/components/calendar/CalendarGrid.tsx` (710L) is the grid. `apps/web/components/calendar/DayWeekToggle.tsx` (110L) is the segmented view toggle to mirror: `export type CalendarView = "day" | "3day" | "week"` and a `SEGMENTS: {value,label}[]` array (`:24,38-42`); the comment at `:8-13` says it is hand-rolled to match the `/tasks` toggle styling.

**Column derivation** (`CalendarGrid.tsx:157-165`) — swap days for weeks/months and this is the timeline's column model:
```ts
if (view === "day") return [startOfDay(date)];
if (view === "3day") { const start = startOfDay(date); return Array.from({length:3},(_,i)=>addDays(start,i)); }
const weekStart = startOfWeek(date, { weekStartsOn: 1 });
return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
```
Header row at `CalendarGrid.tsx:292-331` — CSS `grid` with `gridTemplateColumns: dayColTemplate`, a gutter corner `<div />`, then `format(d,"EEE")` + `format(d,"d")`, accent-colored when `isToday`.

**"Today" computation (client)** — `CalendarGrid.tsx:180-185`: a static `today` per render (used for `isSameDay` at `:301`, `:407`) plus a `now` ticking every 60s via `setInterval`, used only for the marker position. Today wash at `CalendarGrid.tsx:423-428`: `color-mix(in oklch, var(--sd-accent) 5%, transparent)` + a 55% accent inset ring.

**Scroll-to-now with ResizeObserver fallback** (`CalendarGrid.tsx:250-267`) — the pattern to copy for "center today horizontally on mount", substituting `scrollLeft`/`clientWidth`:
```ts
const nowPx = (nowMinutes / 60) * HOUR_PX;
const offset = h / 3;
bodyRef.current.scrollTop = Math.max(0, nowPx - offset);
...
if (scrollToNow()) return;
const ro = new ResizeObserver(() => { if (scrollToNow()) ro.disconnect(); });
```

**Horizontal scroll containers.** `apps/web/components/wiki/journal/JournalRail.tsx:180` is the only scroll-snap rail in the repo and the closest prior art (it also has a today card + `todayIso`/`todayRef` at `:182`):
```tsx
<div className="custom-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
```
Other `overflow-x-auto` without snap: `settings/SettingsSectionNav.tsx:66`, `training/TrainingBoard.tsx:109`, `app/(app)/jarvis/JarvisClient.tsx:118,136`, `nutrition/NutritionHeatMap.tsx:64`. Scroll-position math on a container: `apps/web/components/wiki/explorer-hooks/useRubberBandSelection.ts:62,82,126` (`event.clientX - bounds.left + container.scrollLeft`).

**Virtualization: none.** No `react-window`, `react-virtual`, `@tanstack/react-virtual`, or `virtuoso` in `apps/web/package.json` or the tree. A timeline either introduces one or, consistent with `CalendarGrid`, renders all columns absolutely positioned in a CSS grid.

## 5. Design canon

**Tokens (verbatim, `apps/web/app/globals.css`).** Surfaces, light `:root` (`globals.css:1466-1487`, the global D11 remap that wins app-wide):
```
--sd-app: var(--canvas);            /* :1467  canvas */
--sd-box: var(--surface-raised);    /* :1468  cards/bars */
--sd-input: var(--surface);         /* :1476  insets, chip fills, track */
--sd-line: var(--edge);             /* :1477  THE hairline */
--sd-hover: color-mix(in oklch, var(--ink) 5%, var(--surface));   /* :1479 */
--sd-selected: color-mix(in oklch, var(--ink) 9%, var(--surface)); /* :1480 */
```
Dark equivalents at `globals.css:1350-1365` (`--sd-app: hsl(235 15% 13%)`, `--sd-line: hsl(235 15% 23%)`, …). Ink ladder light `:1430-1432` / dark `:1445-1447`: `--sd-ink` (headings), `--sd-ink-dull` (body), `--sd-ink-faint` (micro-labels/axis) per `docs/DESIGN-SYSTEM.md:33`. Accent `globals.css:1426-1428`: `--sd-accent: var(--hud-cyan-light)` → base `--hud-cyan: oklch(72% 0.13 210)` (`:59`). Functional inks `--ink-amber` (:76), `--ink-sage` (:77), `--ink-coral` (:78) "appear ONLY as 5-6px status dots and 15%-alpha tinted chips, never as chrome" (`DESIGN-SYSTEM.md:18`).

**Fonts.** Space Grotesk is the entire UI including numerals; `--font-sans` and `--font-serif` both resolve to it (`globals.css:31-34`) and `font-serif` is dead (`DESIGN-SYSTEM.md:24`). **EB Garamond is not prose** — `DESIGN-SYSTEM.md:26`: *"EB Garamond survives in exactly one place: the 'Hyperpolymath' logotype, via `--font-logotype`… Serif anywhere else is banned (§16)."* A timeline must never use it. JetBrains Mono (`--font-mono`, `globals.css:36`) is for "dates, eyebrows, kbd hints, unit captions, status micro-copy. It is not a UI font" (`:28`) — date/column headers qualify. Numerals take `tabular-nums` + `tracking-[-0.01em]` (`:73`, `:84`).

**Spacing / radii / hairlines / hover.** Radii ladder (`DESIGN-SYSTEM.md:41`, enumerated at `apps/web/app/design/page.tsx:120-127`): 6px rows/buttons, 8px tiles+chips, 10px inset sub-cards, 12px panels, 14px widget cards, full for pills. Elevation (`:42`) is "grey ladder + 1px `--sd-line` border + a white inset top hairline"; `.sd-panel` at `globals.css:1498-1503`. Page rhythm (`:60`): `px-6 pt-5 pb-12`, sections on a 28px rhythm (`gap-7`), card body `p-5`, grid `gap-4`. **Hover moves the border and nothing else. No backdrop blur, no gradient, no glow, no scale** (`:78`). Focus is `focus-visible:ring-2 ring-[var(--sd-accent)]` + `outline-none` (`:37`). Selection is two-tier (`:37`): neutral `--sd-selected` backplate plus an accent chip on the label only, never an accent-filled row or accent ring.

**§14 motion law** (`DESIGN-SYSTEM.md:129-135`), quoted:
> - Entrances: opacity 0→1, y 4→0, 160ms, `ease [0.25, 1, 0.5, 1]`, stagger `min(i,24) * 10ms`.
> - Collapses: `AnimatePresence` height 0↔auto, 200-320ms on `cubic-bezier(0.32, 0.72, 0, 1)` (`--ease-collapse`).
> - Micro (color / bg / border): 120-150ms ease-out. Tab transitions are 80ms and **color-only**.
> - Press: transform 100ms. Spring overshoot (~4%) ONLY on success and confirm moments.
> - **The zero-jank law**: animate `opacity` / `transform` / `filter` and nothing else. Never animate `width`, `height` (outside a measured collapse), or layout. Everything is interruptible, guarded by `useReducedMotion()`, and never transitions on first paint. No hover-scale anywhere.

Consequence: bar-length changes and zoom must be `scaleX`, never animated `width` (reinforced at `:85`, "Animate `scaleX`, never `width`"). Shipped easings: `--ease-soft-landing` / `--ease-collapse` (`globals.css:1436-1437`).

**§16 banned** (`DESIGN-SYSTEM.md:143`), quoted:
> Gradient washes (green/teal especially). Noise on content surfaces. Orbs above 40px. Serif anywhere but the logotype. Glow rings. Card glassmorphism. Accent-filled rows and accent rings for selection. Hover scales. Hover fills on sidebar nav rows. Italic serif empty states. More than one accent hue. `width`-animated progress. New hex literals.

**§21 data-series color law** (`DESIGN-SYSTEM.md:163-168`), quoted:
> Charts and diagrams are the **one sanctioned exception** to the single-hue rule (§1), and only as *data encoding*, never as chrome.
> - **Cyan (`--sd-accent`) is always the primary series.**
> - Additional series may use the functional inks as **series (data-source) encoding**: `--ink-amber` then `--ink-coral` for the second and third series… No new hues, no gradient fills; the grid is 1px `--sd-line` and axis labels are mono (`--font-mono`, ~10.5px).
> - **A mono legend is REQUIRED whenever more than one series is plotted.** … A multi-color chart shipped without its legend chips is a defect.

Reference implementation: `apps/web/components/nutrition/MacroTrendChart.tsx:40` (grid), `:44-45` (mono axis, ink-faint ticks), `:80-97` (accent → amber → coral), `:111` (legend chip).

**§18 both themes** (`DESIGN-SYSTEM.md:149-151`), quoted:
> Every surface verifies in light AND dark before it ships. Animation QA is a gate, not a polish pass: no layout shift on entrance, no mount flashes, no orphaned hover states, compositor-only at 60fps, reduced-motion clean.

**Scrollbar / overflow.** Global default `globals.css:504-528` (thin, cyan-60% thumb, applied to `html` and `*`). **`.scrollbar-hidden`** (`globals.css:580-589`) is explicitly the horizontal-strip utility: *"Use on horizontal-scroll strips where the scrollbar would add visual noise (kanban columns at width, calendar week scroll, etc)."* Also `.sd-scroll-hover` (`:1671-1690`, reveal-on-hover with a reserved 6px gutter so nothing reflows), `.custom-scrollbar` (`:533-550`), `.hud-scrollbar` (`:556-577`, agent surfaces only). `.mask-fade-out` (`:1658-1665`) is a bottom mask, not horizontal — a left/right edge fade needs a new class per §23, not an inline gradient overlay.

**Exact tokens the timeline should use.**

| Element | Token / class |
|---|---|
| Canvas | `--sd-app` (`globals.css:1467`/`:1351`) — edge-to-edge, no hero plate, no wash (`DESIGN-SYSTEM.md:60`) |
| Frame around the scroller | `.sd-panel` (12px, `--sd-box` + 1px `--sd-line` + inset hairline, `globals.css:1498-1503`), or `WidgetCard` 14px if it is the page's primary object |
| **Bars** | `--sd-accent` fill (§21: cyan is always primary). Second/third *data-source* series only: `--ink-amber`, then `--ink-coral`, plus a required mono legend (`h-[3px] w-3.5 rounded-full` swatch + `font-mono text-[10.5px] uppercase tracking-[0.08em]` `--sd-ink-dull`) |
| Bar track / lane | `--sd-input` (the `.sd-progress` track, `globals.css:1570-1575`), `rounded-full` for pill bars else 6px/8px |
| Bar hover | border only, `transition-colors duration-150`; never scale or glow (`DESIGN-SYSTEM.md:78`, `:133`) |
| Bar selected | `--sd-selected` / `--sd-selected-item` backplate + accent chip on the label; never accent fill or ring (`:37`) |
| **Grid lines** | 1px `--sd-line` — §21 states "the grid is 1px `--sd-line`" (`:167`); `--sd-divider` only for a heavier section split |
| **Today marker** | `--sd-accent`, treated like the areas-tree junction rule: *"3px `--sd-accent` at 70% opacity: no halo, no blur, no pulse"* (`:110`). Glow rings banned (§16). Label as a mono micro-label or a cyan tint chip (`.sd-tint-progress`, `globals.css:1556-1559`) |
| **Column / date headers** | `font-mono text-[11px] uppercase tracking-[0.1em]` `--sd-ink-faint` (canonical date line, `DESIGN-SYSTEM.md:66`, rendered at `apps/web/app/design/page.tsx:381-383`); sticky strip separated by `border-b border-[var(--sd-line)]` |
| Row labels | `text-[14px]`/`text-[15px] font-medium` `--sd-ink`; counts/meta `text-[11px] font-semibold uppercase tracking-[0.08em]` `--sd-ink-faint` (`:112`) |
| Dates in cells | `tabular-nums` (`:84`) |
| Status dots | 5-6px `.sd-dot-*` (`globals.css:1540-1543`), sage/amber/coral, never chrome |
| Horizontal scroller | `.scrollbar-hidden` (`globals.css:583`) — the doc names exactly this use case |
| Zoom / pan | `translateX` / `scaleX` only (§14), `useReducedMotion()`-guarded |

**§23 gotcha** (`DESIGN-SYSTEM.md:177-184`): one-off arbitrary utilities can be dropped by the Tailwind Oxide scan. Sanctioned order: reuse an emitted utility → add a real class to `globals.css` → route the token through inline `style={{}}` (*"the sd charts and legends use it deliberately"*, `:182`). Verify in compiled CSS before claiming done (`:184`).

## 6. View-mode persistence

**The sd3 idiom** — `apps/web/components/lifeos/useWidgetSpans.ts`, a module-level store + `useSyncExternalStore`, not hook-local `useState`. Doc comment at `useWidgetSpans.ts:14-18`:
```
 * Persistence lives at localStorage `lifeos:widget-spans` (a `widgetId → {w,h}`
 * map), mirroring the SSR-safe pattern `lifeos:view` uses: the server and the
 * first client paint both render DEFAULTS (so hydration matches), then `load()`
 * runs in an effect and reconciles to the persisted layout. `getServerSnapshot`
 * therefore also returns defaults — never touch `localStorage` during render.
```
Mechanics: `STORAGE_KEY` (`:35`), `let current` / `let loaded` / `listeners` set (`:160-162`), `persist()` (`:168-174`) and `loadWidgetSpans()` (`:177-202`) both `try/catch`-wrapped, load idempotent via the `loaded` flag, stored payloads validated before adoption (`:195`), `resetWidgetSpans()` (`:212-220`).

**`lifeos:view` — the ancestor it references, and the closest match for a plain view-mode toggle** (`apps/web/components/lifeos/LifeOsCanvas.tsx:38-65`):
```ts
const [view, setView] = useState<View>("widgets");
useEffect(() => {
  try { const stored = localStorage.getItem(STORAGE_KEY); if (stored === "areas") { setView("areas"); } }
  catch { /* localStorage unavailable — stay on widgets */ }
}, []);
const select = useCallback((next: View) => { setView(next); try { localStorage.setItem(STORAGE_KEY, next); } catch {} }, []);
```
It writes **only in the setter**, not a mirror effect, which avoids the load-then-echo write.

**Older, weaker prior art.** `apps/web/components/tasks/TasksClient.tsx:170-171,264-277` — URL-first + localStorage fallback via `nuqs` `useQueryState("view", parseAsString.withDefault("kanban"))` plus a read effect and an echo-prone mirror write effect; also `"tasks-show-lesno"` (`:232-239`), `"tasks-inbox-hidden"` (`:243-251`). Also `KanbanBoard.tsx:104-119`, `OverdueTasksPanel.tsx:13-63`, `InboxColumn.tsx:10-33`, `AreasTree.tsx:95-141` (per-id keys scanned via `localStorage.key(i)`).

**No `useLocalStorage` hook exists** (zero grep hits across `apps/web`) and **no prefs/settings DB table** exists (no `user_settings`/`preferences` in `apps/web/drizzle/*`); server-side prefs exist only as dedicated columns (e.g. gcal visible calendars, `calendar/page.tsx:110-113`).

**Canonical idiom for the timeline toggle:** follow `lifeos:view`. Namespaced colon key (e.g. `projects:timeline-view`), `useState(DEFAULT)` so SSR and first paint match, a mount `useEffect` that reads and validates inside `try/catch`, writes inside the setter, corrupt/unknown values silently falling back to the default. Escalate to the `useWidgetSpans` module-store form only if more than one component (a header toggle plus the grid) must share the state. Layer `nuqs` on top only if the view must be linkable.

## 7. Tests

**Config** — `apps/web/vitest.config.mts`:
```ts
plugins: [tsconfigPaths(), react()],
resolve: { alias: { "server-only": new URL("./tests/stubs/empty.ts", import.meta.url).pathname } },
test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], globals: true },
```
`environment: "jsdom"` is already global and `@vitejs/plugin-react` is wired, so a new component test needs no config change. The `server-only` alias (→ `apps/web/tests/stubs/empty.ts`) is what lets tests import RSC-adjacent modules.

**Setup** — `apps/web/vitest.setup.ts` (4 lines): dotenv `.env.test.local` then `.env.local`, then `import "@testing-library/jest-dom/vitest";`, so `toBeInTheDocument()` is globally available.

**Scripts** — `apps/web/package.json:9-10`:
```json
"test": "vitest run",
"test:watch": "vitest",
```
Root `package.json:13`: `"test": "pnpm --filter web test"`.

**RTL: yes** — `@testing-library/react@^16`, `@testing-library/jest-dom@^6`, `jsdom@^25` in devDependencies. Existing RTL tests include `tests/sidebar-no-refetch.test.tsx`, `tests/jarvis-*.test.tsx`, `tests/inline-markdown.test.tsx`, plus hook tests.

**Where new tests go.** Three coexisting locations, dominated by the first:
1. **`apps/web/tests/<kebab-topic>.test.tsx`** — flat, ~120 files, subdirs only for `journal/`, `nutrition/`, `helpers/`, `stubs/`. **This is where a timeline component test belongs.** Names describe topic/behaviour, not component (`sidebar-no-refetch`, `realtime-visibility-recovery`), so prefer `tests/projects-timeline-today-marker.test.tsx` over `ProjectsTimeline.test.tsx`.
2. Colocated `*.test.ts` next to source — only 2 files, both hooks (`components/shared/use-undo-toast.test.ts`, `use-pending-action.test.ts`).
3. `lib/<area>/__tests__/*.test.ts` for pure logic (`lib/training/__tests__/distance.test.ts`, `lib/projects/` would follow this for a `projectEffectiveStartISO` test).

`.tsx` iff the test renders JSX. Every RTL test opens with a redundant-but-conventional pragma plus a "why this test exists" block citing the phase/plan ID — `tests/sidebar-no-refetch.test.tsx:1-30`:
```ts
/**
 * @vitest-environment jsdom
 *
 * Sidebar areas query — no incidental refetch (Phase 5.1 D-P2 #1 / JARVIS-21)
```
`globals: true` means `describe`/`it`/`expect` need no import, though many files import them from `vitest` anyway.

## RISKS / ASSUMPTIONS

- **Start anchor is undefined for class projects.** `projectEffectiveEndISO()` resolves classes to their semester end, but there is no start counterpart, and `startDate` is nullable. The timeline needs a `projectEffectiveStartISO()` (semester start, or `createdAt` fallback) or classes render as zero-width bars. This is the largest open design question.
- **`startDate` is not selected server-side** at `app/(app)/areas/[areaId]/page.tsx:41-52` and is absent from the `AreaProject` interface (`AreaProjectList.tsx:14-25`). Both must change before any timeline can render.
- **`ViewToggle` is hard-typed `"grid" | "list"`** (`components/ui/explorer/ViewToggle.tsx:7`). Adding `"timeline"` touches the wiki explorer's type surface; generifying it is the cleaner but wider change. Alternatively mirror `DayWeekToggle`'s hand-rolled `SEGMENTS` array, which is the calendar's own answer to the same problem.
- **No virtualization exists in the repo.** Assumed the project count per area is small enough (tens) to render every bar, consistent with `CalendarGrid` rendering all columns. If an all-areas timeline is in scope, this assumption breaks and a new dependency decision is forced.
- **Dates are ISO `YYYY-MM-DD` strings, not timestamps.** Naive `new Date("2026-01-05")` parses as UTC midnight and can render off-by-one in a negative-offset timezone. Assumed the timeline will use the `todayISODate()` / string-comparison idiom already in `lib/projects/archive-status.ts` rather than `Date` math.
- **The collapsed rail cannot reach `/areas`** (`Sidebar.tsx:406`). If the timeline is meant to be a top-level destination, this is a pre-existing gap that a new nav pill would resolve — but `PersistentNav.tsx:109-110` documents the deliberate choice to keep Areas out of `MAIN_ITEMS`.
- Assumed §21's "series" law governs bar color by *data source*, not by project. Coloring one bar per project across the amber/coral inks would violate the single-hue rule (§1) and ship without a meaningful legend; project identity should be carried by the row label, not hue.
- Line/section numbers in `DESIGN-SYSTEM.md` and `globals.css` were read at commit `b5576f77`; they drift with edits.
