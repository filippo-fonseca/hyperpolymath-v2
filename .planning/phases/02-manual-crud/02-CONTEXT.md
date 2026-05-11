# Phase 2: Manual CRUD - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Areas, Projects (incl. Classes), Tasks, and Quick Captures fully usable through the UI **without Kiwi**. By end of phase: sidebar tree of areas/projects renders, project detail page works (Notion-style with two-column Tasks + Captures side-by-side), All Tasks page has kanban + list with drag-reorder + filters, Captures feed has composer + #hashtag autocomplete + search + hashtag-filterable sidebar. Every Server Action that Phase 5 Kiwi will eventually call is built and battle-tested via direct UI use.

**In scope:** AppShell with collapsible sidebar + always-on nav (Today, All Tasks, Captures, Calendar-disabled), tree of Areas → active Projects, project detail page (Notion-style), All Tasks page (kanban + list views), Captures page (feed + hashtag sidebar + search), all CRUD Server Actions for areas/projects/tasks/captures/hashtags/junctions, additional shadcn/ui primitives (Input, Label, Select, Checkbox, Dialog, DropdownMenu, Tabs, Popover, ScrollArea, Sheet, Toast, Avatar), @dnd-kit integration, lucide icon picker, color/gradient banner picker, Cmd+K capture quick-input, full-text search via Postgres `tsvector`/`pg_trgm`.

**Out of scope (deferred):** Realtime cross-tab updates (Phase 3), Calendar functionality (Phase 4 — nav link present but disabled), Kiwi (Phase 5), theme toggle + error boundaries + Sentry + telemetry (Phase 6), image upload via Supabase Storage (deferred — Phase 6 or backlog), capture-to-task conversion affordance (lands in Phase 5 with Kiwi integration), realtime hashtag count updates (Phase 3), notifications, mobile-native breakpoints below iPad-width (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Sidebar & navigation
- **D-01:** **Always-visible left sidebar (~260px), collapsible to icon-only (~64px).** State persists across sessions in localStorage. Toggle button at top of sidebar (chevron-left/right Lucide icon).
- **D-02:** **Persistent nav above the area tree:** Today, All Tasks, Captures, Calendar (Calendar visible but greyed/disabled with tooltip "Coming in Phase 4"). Each is a route in the (app) group.
- **D-03:** **Drag-reorder areas + projects** via @dnd-kit. Areas drag to reorder among other areas; projects drag to reorder within their area; projects drag across areas to re-link to a new area (updates `projects.area_id`). Persist order via an `order_index integer` column on both tables (already exists in schema; if not, add via Drizzle schema additive change — verify in plan).
- **D-04:** **Archive UX:** archived areas/projects hidden by default. Sidebar footer has a "Show archived" toggle that surfaces them with a muted style + an "Unarchive" button on hover. Archive action available via context menu (right-click) on tree items.

### Tasks UI (kanban + list)
- **D-05:** **Default view is kanban.** Five columns matching `task_status` enum order: not started → up next → in progress → almost done → lesno. Toggle button (top-right of view) switches to list. localStorage remembers user's last choice — but kanban is the first-time default.
- **D-06:** **@dnd-kit (version 6.x+ for React 19)** for ALL drag operations: kanban card reorder within column, kanban drag-across columns (changes status), list reorder, sidebar tree reorder. One library, one keyboard-accessible pattern.
- **D-07:** **Edit UX:** **inline-first + side panel for full edit.** Click task title → inline rename. Click row/card body → right-side detail panel slides in (Linear-style, ~420px wide) with all fields (title, description, priority, status, due date, linked projects). Esc to close, click outside to close, Cmd+Enter to save.
- **D-08:** **Filters:** **top toolbar with chip pills.** Active filters render as removable chips: `Priority: P1, P2`, `Status: in progress`, `Due: this week`, `Project: $name`. "+ Filter" dropdown to add new. Filter state lives in URL search params (shareable, back/forward navigates filter changes).

### Quick Captures feed
- **D-09:** **Composer at top of feed (sticky)** + **Cmd+K shortcut** opens a quick-capture modal from anywhere in the app. The modal uses the same composer component, single source of truth. Cmd+K modal is a building block for Phase 5 Kiwi (which replaces the modal contents with the agent UI).
- **D-10:** **Hashtag UX:** typing `#` in the composer triggers an autocomplete dropdown (suggestions filtered as you type). Selected (or new) tags render as **colored chip pills** in both the composer (via contenteditable or custom textarea decoration — decision deferred to research) and the capture cards. Hashtags lowercase-normalized server-side; chip displays first-seen casing.
- **D-11:** **Edit/delete on cards:** **hover reveals a `⋯` menu** in the card corner. Edit → inline (textarea replaces card content body). Delete → confirm modal ("Delete this capture? This can't be undone.").
- **D-12:** **Search:** **persistent search bar in the captures feed header.** Live-filters as user types. Combines with active hashtag filter (search "abc" while filtering #idea → captures matching both). Postgres `tsvector` with `pg_trgm` (already supported by Supabase). Debounced 200ms.

### Project detail page (Notion-style)
- **D-13:** **Icon picker: Lucide icon library.** Curated grid of Lucide icons (~150 most useful: BookOpen, Code2, Dumbbell, Heart, Music, etc.). Search input at top of picker. Stored as a string (icon name) in `projects.icon`. Render via `<DynamicIcon name={...}>` helper. Lucide is already a dep from Phase 1.
- **D-14:** **Banner: color/gradient picker only in Phase 2.** Curated palette of ~16 options (8 solids + 8 gradients matching journal-paper aesthetic — muted earth tones + Renaissance fresco-inspired gradients). Stored as CSS string in `projects.banner`. Image upload deferred to Phase 6 (no Supabase Storage setup needed in Phase 2).
- **D-15:** **Tasks + Captures show as TWO COLUMNS side-by-side** on the project detail page. Left column: Tasks (compact list view with priority + status). Right column: Captures feed (compact card list). Both scrollable independently. On widths below ~960px, stacks vertically (Tasks on top).
- **D-16:** **Class metadata: inline header + "edit class" button.** When `is_class=true`, project header displays inline below the title: `PHIL 277 · Prof. Lloyd · Fall 2026 · A-` (course_code · instructor · semester · grade — only fields with values shown). "Edit class" button opens a modal with all class fields (course_code, full_class_name, instructor, semester, grade, credits, distributionals[]). Concise + glanceable.

### Cross-cutting
- **D-17:** **Server Actions live in `app/actions/<domain>.ts`** files (one per domain: areas.ts, projects.ts, tasks.ts, captures.ts, hashtags.ts). Each action takes FormData or a typed object, validates with Zod, calls Drizzle, returns `{ success: true, data }` or `{ success: false, error: string }`. Phase 5 Kiwi will import these same actions.
- **D-18:** **Page structure: Server Component shell + Client island per page.** SSR fetches initial data via `db.select(...)` in the page component; Client island handles interactivity (drag, inline edit, filter chips, modals).
- **D-19:** **Cmd+K library:** `cmdk` (Vercel's command-menu lib, ~10kb). Wraps both the capture quick-input shortcut AND lays the foundation for Phase 5 Kiwi UI.
- **D-20:** **No image uploads / Supabase Storage in Phase 2.** Defer all binary asset handling to Phase 6 polish (or backlog). Banner is color/gradient only; no project icons beyond Lucide.

### Claude's Discretion
- Specific shadcn/ui primitives to install (the planner picks based on the tasks: at minimum Input, Label, Select, Checkbox, Dialog, DropdownMenu, Tabs, Popover, ScrollArea, Sheet, Toast — `sonner` recommended for toasts in 2026)
- Exact 16-color/gradient palette for banners (within journal-paper aesthetic — muted earth tones, Renaissance-inspired)
- Curated subset of Lucide icons for the picker (~150 most relevant for personal/academic life)
- Whether `order_index integer` column exists on areas/projects in current schema — if not, add via Drizzle additive migration (no breaking change)
- Whether to use contenteditable, a custom textarea overlay, or a library like Lexical/TipTap for the chip-rendering composer — research at planning time, but lean simple (contenteditable + decorations is fine for MVP)
- URL search param schema for task filters (e.g., `?priority=P1,P2&status=in-progress&due=this-week`)
- Loading skeleton designs (within journal-paper aesthetic)
- Empty state copy (Genz-Renaissance brand voice — lean on the wordmark + a one-liner like "Nothing to capture yet — what's on your mind?")
- Optimistic update strategy in Phase 2 (if any) — full RT optimism lands in Phase 3
- Toast positioning + duration

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope
- `.planning/PROJECT.md` — Locked scope, constraints, Key Decisions, non-negotiables (P∞, lesno, capture-first, journal-paper aesthetic)
- `.planning/REQUIREMENTS.md` — Phase 2 requirements: AREA-01..05, PROJ-01..07, TASK-01..08, CAPT-01..08 (28 total)
- `.planning/ROADMAP.md` §Phase 2 — Phase goal, success criteria
- `.planning/STATE.md` — Current project position
- `.planning/phases/01-foundations/01-CONTEXT.md` — Phase 1 locked decisions (D-01..16) — esp. D-01 schema scope (full v1 already shipped), D-02 enum strategy, D-03 junction user_id, D-04 single projects table
- `.planning/phases/01-foundations/01-01-SUMMARY.md` — Existing Server Component shell, Server Actions pattern, Drizzle wiring
- `.planning/phases/01-foundations/01-02-SUMMARY.md` — Schema details (10 tables, enums, RLS policies, junction denormalization)
- `.planning/phases/01-foundations/01-03-SUMMARY.md` — Auth gate pattern at (app)/layout.tsx, Server Actions for forms

### Stack & libraries (locked + this phase's additions)
- `.planning/research/STACK.md` — Established versions (Next 16, React 19.2, Tailwind 4, shadcn/ui, Drizzle 0.36.x, postgres-js with prepare:false). Phase 2 adds: @dnd-kit/core@6+, @dnd-kit/sortable, cmdk, sonner (toasts).
- `.planning/research/ARCHITECTURE.md` §4 (Component boundaries — Server Components + Client islands), §5 (Server Actions for mutations), §3 (schema reference for what tables exist)

### Pitfalls (Phase 2 must address)
- `.planning/research/PITFALLS.md` Pitfall 4 (Realtime subscription leaks — N/A for Phase 2 since no Realtime, but the Server Action mutation pattern is what Phase 3 will subscribe to)
- `.planning/research/PITFALLS.md` Pitfall 16 (Hydration mismatches — relevant since SSR data + client-side filter state must reconcile)
- `.planning/research/PITFALLS.md` Pitfall 19 (No analytics signal — RES-05 `kiwi_events` table ships in Phase 5, not Phase 2; logging deferred but errors should be visible in console at minimum)

### Product spec & v1 reference
- `resources/core.md` — Canonical product spec
- `resources/HYPERPOLYMATH_V2_HANDOFF.md` §4 (page-level patterns from v1 — what to translate, what to improve), §7 (data model — already in our schema), §15 (conventions — TS strict, PascalCase types, camelCase fields, @/ alias)
- `resources/idea_for_polymathy.md` — Brand voice for empty states + copy

### Existing code (Phase 1 outputs to reuse, not recreate)
- `apps/web/lib/db/schema.ts` — All 10 tables already defined; do NOT duplicate
- `apps/web/lib/db/index.ts` — Drizzle client export
- `apps/web/lib/supabase/server.ts` — Server-side Supabase client (used in Server Actions for auth context)
- `apps/web/lib/auth/get-user.ts` — `getUserOrRedirect()` + `requireOnboarded()` helpers; reuse for `userId` in Server Actions
- `apps/web/components/ui/{button,card}.tsx` — Existing shadcn primitives
- `apps/web/app/(app)/layout.tsx` — Auth gate (will house the AppShell with sidebar)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`(app)/layout.tsx`** — Currently calls `getUserOrRedirect()` and renders children. Phase 2 expands this to host the AppShell (sidebar + main pane). Single auth gate stays.
- **`getUserOrRedirect()` / `requireOnboarded()`** in `lib/auth/get-user.ts` — Use these in pages AND Server Actions for the userId.
- **`db` from `@/lib/db`** — Pre-wired Drizzle client; just import and query.
- **`schema.ts`** — All tables/enums defined; import column references for type-safe queries.
- **`Button` + `Card` from `components/ui/`** — Existing shadcn primitives; same import pattern (`@/components/ui/<name>`) for new ones.
- **`{onboarding,settings}-form.tsx`** — Reference pattern for form components consuming Server Actions (Client Component with `<form action={serverAction}>`).
- **`{sign-in,sign-out}-button.tsx`** — Reference pattern for client-side trigger components.

### Established Patterns

- **Server Component shell + Client island** — Page is `async`, fetches data via `db.select(...)`, renders shell + a Client island for interactivity.
- **Server Actions in colocated `actions.ts` files next to the page** — Phase 1 used this pattern (e.g., `app/(app)/onboarding/actions.ts`). Phase 2 expands to centralized `app/actions/<domain>.ts` for shared cross-page actions (D-17).
- **`getClaims()` everywhere — never `getSession()`** (PITFALLS Pitfall 2)
- **Single auth gate at `(app)/layout.tsx`** — never per-page
- **Form actions: `<form action={serverAction}>` with the Server Action imported via `@/`**
- **No `db:push`** — schema additions go through Drizzle generate + supabase migrations (D-14 from Phase 1)

### Integration Points

- **Sidebar tree → Server Action `getAreasWithProjects(userId)`** — single query joining areas + projects (filtered by archived=false, ordered by order_index)
- **Project detail page → `[areaId]/[projectId]/page.tsx`** OR `/projects/[projectId]/page.tsx` — planner picks the cleaner URL structure
- **Cmd+K capture composer → mounted in `(app)/layout.tsx`** — global, available everywhere
- **Project link autocomplete in tasks/captures → reuses the same project list query as the sidebar tree** (cache via TanStack Query when Phase 3 lands; for Phase 2 just refetch on each page)
- **Hashtag autocomplete → Server Action `getHashtagsForUser(userId)` returning sorted-by-count list**
- **Toast notifications → mount the toaster (sonner `<Toaster />`) in `(app)/layout.tsx`**

</code_context>

<specifics>
## Specific Ideas

- **Linear-style right-side detail panel** for task editing (~420px, slide-in from right, Esc/click-outside to close) — proven UX, low cognitive load
- **Notion's "Cover" picker** as the model for the banner color/gradient grid (deliberately limited palette > infinite choice)
- **Twitter/Mastodon composer at top of feed** for captures (sticky, multiline, autocomplete chips)
- **Linear's filter chip pills** at top of task views (active filters always visible, easy to remove)
- **Curated Lucide subset for project icons** (~150 — not the full 1000+ library) — keep choice scope tight
- **Empty state copy follows brand voice** — lean Genz-Renaissance, e.g., "Nothing here yet. The polymath knows where to begin."
- **Class metadata format inspiration:** `PHIL 277 · Prof. Lloyd · Fall 2026 · A-` (academic gravitas, single inline line)

</specifics>

<deferred>
## Deferred Ideas

- **Realtime cross-tab live updates** → Phase 3 (the entire RT-01..05 requirement set)
- **Calendar functionality** → Phase 4 (nav link present in sidebar but disabled with tooltip)
- **Kiwi agent + multi-action inference + capture-to-task affordance** → Phase 5
- **Theme toggle (light/dark) + Sentry + error boundaries + /insights telemetry** → Phase 6
- **Image upload via Supabase Storage** (project banners as images, attachments on captures) → Phase 6 polish or backlog
- **URL/link auto-detection in captures** (renders link previews) → Phase 6 polish or backlog
- **Image attachments on captures** → Phase 6 / backlog
- **Capture-to-task conversion affordance** → Phase 5 (when Kiwi misroutes)
- **Bulk task operations** (multi-select + bulk reschedule/delete) → Phase 6 / backlog
- **Mobile breakpoints below iPad-width** (~768px) → Phase 6
- **Cross-area project move via tree drag** — the basic version ships in D-03 but advanced UX (visual drop-zone indicators, undo) deferred to polish
- **Persistent kanban column scrolling positions** → Phase 6 polish
- **Quick-add task input with priority/date tokens** (like v1's Twilio SMS parsing) — defer to Phase 5 Kiwi (the agent will handle this elegantly via natural language)
- **Search-in-tree** (filter sidebar tree by query) → Phase 6 polish
- **Keyboard shortcuts beyond Cmd+K** (j/k navigation, e for edit, etc.) → Phase 6 polish
- **Saved filter views** for tasks → Backlog
- **Hashtag rename / merge tools** → Backlog
- **Realtime hashtag count updates** → Phase 3 with the rest of Realtime

</deferred>

---

*Phase: 02-manual-crud*
*Context gathered: 2026-05-10*
