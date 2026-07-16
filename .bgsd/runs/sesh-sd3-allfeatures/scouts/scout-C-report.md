# LifeOS Recon — Scout C Report

## 1. /lifeos composition map (top → bottom)

Page: `apps/web/app/(app)/lifeos/page.tsx` — server component, thin orchestrator. Root: `<main class="min-h-full">` → `<div class="flex flex-col gap-7 px-6 pt-5 pb-12">`. **No tab bar exists** — the prompt's "segmented pill tab bar" is not in this branch. `grep` for pill/tab hits only *status pills* inside widgets (`entity-card.tsx`). Sections just stack vertically:

| # | Section | Component | Approx height @1440w | Notes |
|---|---------|-----------|----------------------|-------|
| — | wrapper | `page.tsx` | `pt-5`+`pb-12`, `gap-7` (28px) between each | scroll not owned here |
| 1 | Hero (greeting + stat strip) | `LifeOsHero.tsx` | ~150px | greeting row `mt-2 mb-5` (~52px) + stat strip `mb-7`, `lg:grid-cols-6` single row (~64px). Bounded. |
| 2 | Quick-send composer | `LifeOsQuickSend.tsx` | ~80–100px | bounded |
| 3 | **Areas tree** | `LifeOsAreasSection.tsx` → `LifeOsAreasShell.tsx` → `AreasTree` | **unbounded (~300–650px)** | `mb-12`; renders full sidebar tree (all areas+projects). Primary scroll driver. |
| 4 | Bento grid (widgets) | `LifeOsBentoGrid.tsx` | ~560px+ | `mb-7`; `auto-rows-[minmax(180px,auto)]`; Tasks hero `row-span-2` (~360px) + bottom captures row (~180px). Captures widget can grow. |
| 5 | Insights | `WidgetCard` + `LifeOsInsightsWidget` | ~180px | bounded |

Sum (~1230–1600px) far exceeds ~820–900px usable at 1440×900 / 1512×982. **Scroll owner is the AppShell main content wrapper** (the `@container/main` scroll region), not `<main>` itself (`min-h-full`). Sections 3+4 together already overflow one viewport.

Both `LifeOsAreasShell` and `LifeOsBentoGrid` already have independent collapse state via `usePersistedCollapse(key)` (localStorage keys `lifeos:areas:collapsed`, `lifeos:widgets:collapsed`) with a `CollapseChevron`. **This is the only existing UI-pref persistence** — no settings table, just localStorage.

## 2. Recommended structural approach (A/B/C)

Cheapest path: introduce a small client wrapper (`LifeOsCanvas`) that holds a `view: "widgets" | "areas"` state persisted with the *existing* `usePersistedCollapse`-style localStorage helper (add key `lifeos:view`, default `"widgets"`). Render `LifeOsHero` + `LifeOsQuickSend` always; then a two-segment toggle ("view widgets / view areas") placed where the current section headers sit; conditionally render **either** `LifeOsBentoGrid` **or** `LifeOsAreasSection` (never both). This makes widgets the default center content and demotes the areas tree to the alternate view, deleting sections 3-and-4-stacked (the overflow cause) in one move. For B (fit one viewport): wrap the swappable region in `h-[calc(100dvh-var(--appshell-top)-<hero+quicksend>)]` with `overflow-hidden`, drop the Insights section into the widgets grid as a cell (or cut it), compress the bento to a fixed 2-row grid (`grid-rows-[minmax(0,1fr)_minmax(0,1fr)]` instead of `auto-rows`), tighten `gap-7`→`gap-4` and widget `p-5`→`p-4`, and cap the unbounded widgets (Captures/Tasks lists get a row cap + internal `overflow-y-auto`). Areas view keeps its own internal scroll since a full tree can't be forced to one screen. Since `LifeOsAreasSection` is an async server component, the toggle wrapper must receive both branches as `children`/props (server renders both, client shows one) — or lazy-mount areas on first switch.

## 3. "Fit one view" specifics

Compressible: stat strip already 1 row; bento gap/padding; Insights removable. **Unbounded widgets** needing row caps + internal scroll: `UpcomingTasksWidget` (limit=7 today, still tall), `RecentCapturesWidget` (full-width stream), `AreasTree` (only in areas view). Grid must move from `auto-rows-[minmax(180px,auto)]` to viewport-height-aware fixed rows (`h-[calc(100dvh-…)]` + `min-h-0` on cells) so tiles shrink instead of pushing the page.

## 4. Project editing (D)

**Route:** `apps/web/app/(app)/projects/[projectId]/page.tsx` → `ProjectDetailClient.tsx` → `ProjectHeader.tsx`.
**Current edit flow:** Only **title** is inline-editable — `ProjectHeader.tsx:220-251` swaps `<h1 onClick={handleNameClick}>` for an `<input>`, commits via `updateProject({id,name})` through `addOptimisticProject`. **Icon is display-only:** `<DynamicIcon name={project.icon} size={32}>` at `ProjectHeader.tsx:210-217` — no click handler. Banner is editable (hover `BannerPicker`); other fields only via the gear → `ProjectSettingsDialog` (area move, dates, archive) and, for classes, `ProjectEditClassDialog`.

**Schema (`schema.ts:169-186`):** `projects` has a single `icon` text column (no separate emoji/color columns). Also present but **not inline-editable**: `description` (shown? not in header — likely unused on detail), `areaId` (rendered as a read-only area badge pill at `ProjectHeader.tsx:187-206`, editable only via settings dialog), `bannerUrl` (editable via hover). No `color` column on projects.

**Reusable picker — yes:** `apps/web/components/projects/IconPicker.tsx` already does exactly what's needed: a Radix `Popover` trigger button showing the current icon, a grid of 150 curated Lucide icons (`icon-registry.ts` / `CURATED_ICONS`) **plus an emoji input field**, and `onChange(iconName|null)` writing the one `icon` string. It's already used in `ProjectCreateDialog.tsx`. `DynamicIcon` renders either a Lucide name or an emoji from that same string. (Note: `IconPicker` styling uses shadcn tokens `bg-input/border-input`, not the sd `--sd-*` register — may need a restyle pass to match the new design.) `emoji-mart`/`frimousse` are **not** web deps (emoji-mart only appears transitively via BlockNote in `.next` cache).

**Recommended D pattern:** Wrap the header `DynamicIcon` in the existing `IconPicker` (Notion-style click-to-edit): replace the static icon block at `ProjectHeader.tsx:208-217` with `<IconPicker value={project.icon} onChange={handleIconChange}/>`, where `handleIconChange` mirrors `handleNameCommit` — optimistic `addOptimisticProject({type:"update",patch:{icon}})` + `updateProject({id,icon})` (the action already accepts `icon: z.string().max(50).nullable().optional()`, `UpdateProjectSchema` line 149). Same pattern extends to making the **area badge** a click-to-change control (reusing settings' area-move logic) and, if wanted, inline `description`. Zero schema/migration work — all target columns and the server action already exist.
