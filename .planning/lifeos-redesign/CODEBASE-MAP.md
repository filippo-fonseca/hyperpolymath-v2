# LifeOS Codebase Map (current state)

> Read-only scout output, persisted for the redesign. **Preserve:** `AreasTree`. **Replace:** everything under `apps/web/components/lifeos/*` and the `/lifeos` page composition.

## 1. Areas Tree (PRESERVE)
- **Component:** `apps/web/components/areas/AreasTree.tsx` (~765 lines, client, pure visualization — **no DnD**).
- **Pages:** `apps/web/app/(app)/areas/page.tsx` (dedicated) and `apps/web/components/lifeos/LifeOsAreasSection.tsx` (embed on `/lifeos`).
- **Props:** `{ areas: SidebarArea[]; rootAvatarUrl: string|null; rootInitial: string; rootLabel: string }`.
- **Data type `SidebarArea`** (`apps/web/lib/db/queries/sidebar.ts`): `id, name, emoji, orderIndex, archivedAt, projects[]`; project: `id, name, icon, orderIndex, isClass, archivedAt`.
- **Fetch:** `getSidebarTree(user.id, true)` then filter `archivedAt === null`. SSR props — **no TanStack Query inside the tree**.
- **Mutations live elsewhere:** `apps/web/app/actions/areas.ts` (CRUD/reorder); DnD reorder/move in `apps/web/components/shell/SidebarTree.tsx`; live sidebar via `Sidebar.tsx` (`useQuery` + `useTableSubscription("areas"|"projects")`).
- **Visual mechanics (reuse notes):** ResizeObserver + getBoundingClientRect → SVG orthogonal paths (trunk→junction→branch); animated feed dots (`animateMotion`); per-area deterministic OKLCH color from `area.id` hash; CSS tokens `--canvas --ink --edge --hud-cyan --glass-*`; 240px fixed card width.
- **Reuse in 3D:** feed it `getSidebarTree` output; keep component or extract SVG layer; subscribe to Realtime separately if live updates needed. It does NOT do reorder/create/archive/Realtime.

## 2. Current LifeOS surface (REPLACE)
Route `apps/web/app/(app)/lifeos/page.tsx`, CSS scope `.lifeos-glass`. Stacked dashboard:
1. `LifeOsHero` — date/greeting + 3 stat chips (generic; duplicates widgets).
2. `LifeOsQuickSend` → `LiteJarvisComposer` — just stashes `sessionStorage['jarvis-prefill']` and redirects to `/today` (indirection, not inline agent).
3. `LifeOsAreasSection` → `LifeOsAreasShell` → **AreasTree** (keep tree; shell is disposable chrome).
4. `LifeOsBentoGrid` — layout scaffold + collapse toggle.
5. `UpcomingTasksWidget` — best widget; real interactivity, SSR + `tableKey("tasks")` + Realtime.
6. `TodayHabitsWidget` — ring + toggle.
7. `TodayTrainingWidget` — read-only.
8. `RecentCapturesWidget` — capture stream, convert-to-task.
9. `LifeOsInsightsWidget` — thin static stats.
Widgets pattern: SSR `initialData` → `useQuery` + `useTableSubscription` → server actions.

## 3. Architecture
- Route groups: public (`/`, `/sign-in`, ...) and `(app)/*` (authenticated). Default left tab fallback `/lifeos`.
- Layout stack: `app/layout.tsx` (theme, fonts EB Garamond + JetBrains Mono) → `(app)/layout.tsx` (auth gate `getUserOrRedirect`, NuqsAdapter, QueryProvider, SearchProvider, NavHistoryProvider, AppShell) → `(app)/template.tsx` (150ms fade).
- Shell: `AppShell.tsx` (sidebar + main + JARVIS split panel), `Sidebar.tsx` (areas DnD owner), `PersistentNav.tsx`, `SidebarTree.tsx`, `TopTabBar.tsx` (JARVIS pill → `/today`).
- Auth: `proxy.ts` `updateSession`; `getClaims()` in server code (never `getSession()`); `requireOnboarded()`.
- Data: Drizzle (server), TanStack Query (client reads, SSR initialData, staleTime 30s), Supabase Realtime (`useTableSubscription` → invalidate only), server actions (mutations). Query keys `[table, userId]` via `tableKey()`.

## 4. Data models (Drizzle `apps/web/lib/db/schema.ts`)
- `areas`: id, user_id, name, emoji, order_index, archived_at, timestamps. Partial index active. Sentinel "No Area" (orderIndex 9999).
- `projects`: id, user_id, area_id (RESTRICT), name/description/icon/banner, start/end date, archived_at, class fields (is_class, course_code...), order_index.
- `tasks`: id, user_id, title, notes, priority (`P∞|P1|P2|P3`), status (incl `lesno`=done), due_date, kanban_position, recurrence jsonb, url. Junction `tasks_projects` (M:N).
- `captures`: id, user_id, content, created_via (`jarvis`), source_device/input, content_search tsvector, github_issue fields. Junctions `captures_projects`, `captures_hashtags`.
- **Google Calendar:** NOT in Postgres. GCal is source of truth; users table holds encrypted OAuth tokens (`gcal_*`), `timezone`. Runtime `apps/web/lib/gcal/token.ts` via `googleapis`.

## 5. Agent = JARVIS (not a separate Kiwi API)
- **Text path:** `POST /api/jarvis` (SSE): events `turn-start|text|queued|clarification|action|done|error`. Client helper `apps/web/components/jarvis/jarvis-stream-client.ts` (`streamJarvis`).
- Request body: `{ input, history[], parsedDates?, parsedPriority?, slashCommand?, linkedProjectIds?, linkedHashtags?, linkedPeople? }`.
- Auth: Supabase cookie + `getClaims()`. BYOK Anthropic key (402 if missing).
- Pipeline: route → `apps/web/lib/jarvis/run-turn.ts` → tools `packages/jarvis-core/src/tools/index.ts` (17 tools) → executor `apps/web/lib/jarvis/executor` (DB + GCal).
- UI surfaces: `/today` `JarvisConsole.tsx`, global Cmd+K `GlobalJarvisDialog` + `LiteJarvisComposer`, voice routes `/api/jarvis/voice/*`. Post-action `invalidateAfterJarvisAction`.

## 6. Stack reality (`apps/web/package.json`)
next ^16, react ^19.2, tailwind ^4.1, motion 12.38 (not framer-motion), @supabase/ssr ^0.10, supabase-js ^2.45, drizzle-orm ^0.36, @anthropic-ai/sdk ^0.96, @tanstack/react-query ^5.59, @dnd-kit/core 6.3.1, zod 4, postgres ^3.4, googleapis ^171.
- **No Three.js / R3F / drei / any WebGL installed.** Only 2D: `react-force-graph-2d` ^1.29, `d3-force` ^3. 3D shell needs new deps.

## 7. Desktop (Jarvis) — `apps/desktop/`
Tauri 2 + Vite + vanilla TS. Voice/TTS/wake companion; calls web APIs (`/api/jarvis/voice/*`, `/tts`, `/physical/events`) with device bearer token. Shares `@hyperpolymath/jarvis-core`. **No LifeOS embed.**
