# Phase 2: Manual CRUD - Research

**Researched:** 2026-05-07
**Domain:** Next.js App Router CRUD UI — drag-and-drop, rich text chip composer, full-text search, command palette
**Confidence:** HIGH (stack locked; new-lib research verified against npm registry + official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sidebar & navigation**
- D-01: Always-visible left sidebar (~260px), collapsible to icon-only (~64px). State persists in localStorage. Toggle: chevron-left/right Lucide icon.
- D-02: Persistent nav above the area tree: Today, All Tasks, Captures, Calendar (Calendar visible but greyed/disabled with tooltip "Coming in Phase 4").
- D-03: Drag-reorder areas + projects via @dnd-kit. Areas drag among areas; projects drag within area; projects drag across areas (updates `projects.area_id`). Order via `order_index integer` on both tables.
- D-04: Archive UX — archived areas/projects hidden by default. Sidebar footer "Show archived" toggle. Archive via right-click context menu on tree items.

**Tasks UI (kanban + list)**
- D-05: Default view is kanban. Five columns matching `task_status` enum order. Toggle switches to list. localStorage remembers last choice.
- D-06: @dnd-kit (version 6.x+ for React 19) for ALL drag: kanban reorder, kanban cross-column (status change), list reorder, sidebar tree reorder.
- D-07: Edit UX — inline-first + side panel for full edit (~420px, Linear-style). Click title → inline rename. Click card body → right-side detail panel. Esc to close, click outside to close, Cmd+Enter to save.
- D-08: Filters — top toolbar with chip pills. Filter state in URL search params.

**Quick Captures feed**
- D-09: Composer at top of feed (sticky) + Cmd+K shortcut opens quick-capture modal from anywhere. Same composer component, single source of truth.
- D-10: Hashtag UX — typing `#` triggers autocomplete dropdown. Selected/new tags render as colored chip pills. Hashtags lowercase-normalized server-side; chip displays first-seen casing.
- D-11: Edit/delete on cards — hover reveals `⋯` menu. Edit → inline textarea. Delete → confirm modal.
- D-12: Search — persistent search bar in captures feed header. Live-filters, debounced 200ms. Combines with active hashtag filter. Postgres `tsvector` with `pg_trgm`.

**Project detail page**
- D-13: Icon picker — Lucide icons (~150 curated). Stored as icon name string in `projects.icon`. Rendered via `<DynamicIcon>` helper.
- D-14: Banner — color/gradient picker only in Phase 2. ~16 options (8 solids + 8 gradients). Stored as CSS string in `projects.banner_url`. No image upload.
- D-15: Two-column layout (Tasks + Captures) on project detail. Below ~960px stacks vertically.
- D-16: Class metadata rendered inline below project title. "Edit class" button opens modal.

**Cross-cutting**
- D-17: Server Actions in `app/actions/<domain>.ts` files (areas.ts, projects.ts, tasks.ts, captures.ts, hashtags.ts). Each validates with Zod, returns `{ success: true, data }` or `{ success: false, error: string }`. Phase 5 Kiwi imports these same actions.
- D-18: Page structure — Server Component shell + Client island per page. SSR fetches initial data via `db.select(...)`.
- D-19: Cmd+K library — `cmdk` (~10kb). Foundation for Phase 5 Kiwi UI.
- D-20: No image uploads / Supabase Storage in Phase 2. Banner is color/gradient only.

### Claude's Discretion
- Specific shadcn/ui primitives to install (minimum: Input, Label, Select, Checkbox, Dialog, DropdownMenu, Tabs, Popover, ScrollArea, Sheet, Toast — sonner recommended for toasts)
- Exact 16-color/gradient palette for banners (within journal-paper aesthetic)
- Curated subset of Lucide icons for the picker (~150)
- Whether `order_index` column exists on areas/projects in current schema — if not, add via Drizzle additive migration
- Whether to use contenteditable, textarea overlay, or a library like Lexical/TipTap for the chip-rendering composer
- URL search param schema for task filters
- Loading skeleton designs (within journal-paper aesthetic)
- Empty state copy (Genz-Renaissance brand voice)
- Optimistic update strategy in Phase 2 (if any)
- Toast positioning + duration

### Deferred Ideas (OUT OF SCOPE)
- Realtime cross-tab updates (Phase 3 — RT-01..05)
- Calendar functionality (Phase 4 — nav link present but disabled)
- Kiwi agent (Phase 5)
- Theme toggle + Sentry + error boundaries + telemetry (Phase 6)
- Image upload via Supabase Storage (Phase 6 or backlog)
- Capture-to-task conversion affordance (Phase 5)
- Realtime hashtag count updates (Phase 3)
- Cross-area project move advanced UX
- Persistent kanban column scroll positions
- Quick-add task with priority/date tokens
- Search-in-tree
- Keyboard shortcuts beyond Cmd+K
- Saved filter views
- Hashtag rename/merge tools
- Mobile-native breakpoints below iPad-width (Phase 6)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AREA-01 | Create Area (name, emoji, order index) | Server Action in `app/actions/areas.ts`; Drizzle insert with `orderIndex` |
| AREA-02 | Edit Area (rename, emoji, reorder) | Update action + @dnd-kit reorder triggers update action |
| AREA-03 | Archive Area | Soft-delete via `archivedAt` timestamp; toast with Undo |
| AREA-04 | Delete Area blocked if projects exist | Server Action validates child count before delete |
| AREA-05 | View all Areas as sidebar tree top level | Server Component SSR + `getAreasWithProjects(userId)` query |
| PROJ-01 | Create Project (all fields incl. optional class metadata) | Server Action; shadcn Dialog with form |
| PROJ-02 | Edit any Project field | Update action; project detail page form |
| PROJ-03 | Archive Project | Soft-delete; same pattern as Area archive |
| PROJ-04 | Delete Project (tasks/captures lose link, persist) | Cascade-nullify on junction tables; Server Action |
| PROJ-05 | Mark as Class + set class fields | is_class toggle in form; class metadata modal (D-16) |
| PROJ-06 | Project detail page (Notion-style, icon, banner, tasks, captures) | Route `/projects/[projectId]/page.tsx`; two-column layout |
| PROJ-07 | Sidebar tree renders Areas → Projects; click opens detail | Client island tree with @dnd-kit drag handles |
| TASK-01 | Create Task (all fields + multi-project link) | Server Action; "Add task" button in kanban column footer |
| TASK-02 | Edit any Task field inline | Right-side detail panel (D-07) + inline title edit |
| TASK-03 | Mark Task as `lesno` | Status update action; lesno toast; checkmark animation |
| TASK-04 | Delete Task with confirmation | Confirm Dialog; destructive Server Action |
| TASK-05 | All Tasks page: kanban + list views with toggle | @dnd-kit DnD context; view toggle in localStorage |
| TASK-06 | Drag-reorder within column + cross-column (status change) | @dnd-kit/sortable SortableContext per column; DragOverlay |
| TASK-07 | Filter by priority/status/due/project (URL params) | nuqs typed search params; chip pill UI |
| TASK-08 | Project detail shows linked tasks | Query `tasks_projects` junction; compact task list |
| CAPT-01 | Create Capture (freeform text + hashtags + project links) | Chip composer component; Server Action creates capture + hashtag upsert + junction inserts |
| CAPT-02 | Edit Capture text and tags | Inline edit mode (D-11) |
| CAPT-03 | Delete Capture | Confirm dialog pattern |
| CAPT-04 | Captures page: reverse-chronological feed | SSR initial data; Client island |
| CAPT-05 | Hashtag sidebar with counts; click to filter feed | Server Action `getHashtagsForUser`; sorted by count DESC |
| CAPT-06 | Full-text search via Postgres tsvector / pg_trgm | Generated column `content_search tsvector`; GIN index; Drizzle `sql` query |
| CAPT-07 | Project detail shows linked captures | Query `captures_projects` junction |
| CAPT-08 | Hashtags normalized to lowercase; first-seen casing displayed | `name` (lowercase canonical) + `display_name` (first-seen casing) already in schema |
</phase_requirements>

---

## Summary

Phase 2 is the largest phase in the project — it installs ~8 new libraries and builds all four primary CRUD surfaces (Areas, Projects, Tasks, Captures) plus the AppShell, sidebar, Cmd+K modal, full-text search, and drag-and-drop. The stack is already locked from Phase 1; this phase's research focuses on the eight new additions: @dnd-kit, cmdk, sonner, the chip composer library choice, nuqs for URL state, Lucide lazy-loading, Postgres full-text search via tsvector, and the shadcn/ui primitives install wave.

The hardest single decision is the capture composer (CAPT-01). The recommendation is **TipTap 3.x with the Mention extension** — it is the only option that delivers real chip-replacement (not overlay tricks), handles cursor positioning correctly, and ships a production-tested autocomplete popover pattern. The bundle cost (~50–80kb gzip for `@tiptap/react` + `@tiptap/extension-mention` + `@tiptap/starter-kit`) is justified by the DX and correctness advantages, and Phase 5 Kiwi reuses the same composer for `$project` chips.

A critical schema gap: the `projects` table has no `order_index` column. Areas have it; Projects do not. This requires an additive Drizzle migration before drag-reorder of projects (PROJ-02 + D-03) can land.

The UI-SPEC (02-UI-SPEC.md) is already authored and approved — the planner must not contradict its color, typography, spacing, or copy decisions.

**Primary recommendation:** Build in four waves — (1) AppShell + nav skeleton, (2) Server Actions + schema migration for all domains, (3) domain UIs in dependency order (Areas → Projects → Tasks → Captures), (4) cross-cutting (Cmd+K, filters, search, drag-and-drop polish).

---

## Standard Stack

### Core (already installed — verify against `apps/web/package.json`)

| Library | Version (installed) | Purpose |
|---------|---------------------|---------|
| Next.js | `^16.0.0` | App Router, Server Components/Actions |
| React | `^19.2.0` | UI runtime |
| TypeScript | `^5.6.0` | Type system (strict) |
| Tailwind CSS | `^4.1.0` | Styling (CSS-first, `@theme`) |
| Drizzle ORM | `^0.36.0` | Schema + typed queries |
| `@supabase/ssr` | `^0.10.0` | SSR auth client |
| `@supabase/supabase-js` | `^2.45.0` | Browser client (Realtime, Auth) |
| lucide-react | `^0.460.0` | Icons (already installed) |
| `radix-ui` | `^1.4.3` | Radix primitives (transitive via shadcn) |
| Motion | NOT YET INSTALLED | Animations |

### Phase 2 Additions (to install)

| Library | Version (npm latest) | Purpose | Why |
|---------|----------------------|---------|-----|
| `@dnd-kit/core` | `6.3.1` | DnD context, sensors, collision detection | D-06; replaces deprecated react-beautiful-dnd |
| `@dnd-kit/sortable` | `10.0.0` | Sortable preset for lists + kanban | Requires `@dnd-kit/core ^6.3.0` — versions are compatible |
| `@dnd-kit/utilities` | `3.2.2` | CSS transform utilities for DragOverlay | Companion to sortable |
| `cmdk` | `1.1.1` | Command palette (Cmd+K) | D-19; shadcn Command wraps it |
| `sonner` | `2.0.7` | Toast notifications | Smallest, best DX; recommended by shadcn in 2026 |
| `motion` | `12.38.0` | Animations | Import from `motion/react`; RSC-compatible |
| `nuqs` | `2.8.9` | Typed URL search params | D-08 filter state; `useState`-like API for URL params |
| `@tiptap/react` | `3.23.1` | Rich text editor (chip composer) | **Recommended for CAPT-01** — see Composer section |
| `@tiptap/starter-kit` | `3.23.1` | TipTap base extensions bundle | Required peer |
| `@tiptap/extension-mention` | `3.23.1` | Autocomplete + chip rendering (hashtags + $projects) | Purpose-built for this pattern |
| `react-hook-form` | `7.x` | Forms (create/edit modals) | De-facto standard; pair with `@hookform/resolvers/zod` |
| `@hookform/resolvers` | `latest` | Zod resolver for react-hook-form | Bridges Zod 4 validation into RHF |
| `zod` | `4.x` | Runtime validation in Server Actions | Already a project dependency conceptually; verify installed |
| `date-fns` | `4.x` | Date formatting (due dates, created timestamps) | Tree-shakeable, TS-first |

### shadcn/ui Primitives to Install (in wave order per UI-SPEC)

**Wave 1 (AppShell):**
```bash
npx shadcn@latest add separator tooltip
```

**Wave 2 (Forms and inputs):**
```bash
npx shadcn@latest add input label textarea select checkbox
```

**Wave 3 (Overlays):**
```bash
npx shadcn@latest add dialog dropdown-menu popover sheet command
```
Note: `command` is shadcn's wrapper around `cmdk` — install it instead of using cmdk directly.

**Wave 4 (Layout helpers):**
```bash
npx shadcn@latest add tabs scroll-area avatar badge
```

Install `sonner` separately (not a shadcn primitive):
```bash
npm install sonner
```

### Full Install Command

```bash
cd apps/web

# Phase 2 new dependencies
npm install @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2
npm install cmdk sonner motion nuqs
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-mention
npm install react-hook-form @hookform/resolvers zod date-fns

# shadcn components (run each wave sequentially)
npx shadcn@latest add separator tooltip
npx shadcn@latest add input label textarea select checkbox
npx shadcn@latest add dialog dropdown-menu popover sheet command
npx shadcn@latest add tabs scroll-area avatar badge
```

---

## Schema Gap: Projects `order_index` Missing

**Verified:** The `projects` table in `apps/web/lib/db/schema.ts` does NOT have an `order_index` column. The `areas` table has `orderIndex: integer("order_index").notNull().default(0)` at line 42, but the projects table is missing it.

**Action required:** Add `orderIndex` to `projects` table via additive Drizzle migration. This is required for D-03 (drag-reorder projects within area) and PROJ-02.

```typescript
// Addition to projects table in schema.ts
orderIndex: integer("order_index").notNull().default(0),
```

Migration steps:
1. Add `orderIndex` to `projects` table in `schema.ts`
2. Run `drizzle-kit generate` to create migration SQL
3. Run `drizzle-kit migrate` to apply
4. No data migration needed — default 0 is safe for existing rows

---

## Architecture Patterns

### Recommended Route Structure (Phase 2)

```
apps/web/app/
├── (app)/
│   ├── layout.tsx                    # EXISTING: auth gate → expand to AppShell
│   ├── today/page.tsx                # EXISTING: stub — no change
│   ├── tasks/
│   │   └── page.tsx                  # NEW: Server Component → KanbanBoard client island
│   ├── captures/
│   │   └── page.tsx                  # NEW: Server Component → CapturesFeed client island
│   ├── projects/
│   │   └── [projectId]/page.tsx      # NEW: Server Component → ProjectDetail client island
│   ├── settings/
│   │   └── page.tsx                  # EXISTING: expand with settings form
│   └── onboarding/                   # EXISTING: unchanged
└── actions/
    ├── areas.ts                      # NEW: createArea, updateArea, archiveArea, deleteArea, reorderAreas
    ├── projects.ts                   # NEW: createProject, updateProject, archiveProject, deleteProject, reorderProjects
    ├── tasks.ts                      # NEW: createTask, updateTask, deleteTask, reorderTasks, updateTaskStatus
    ├── captures.ts                   # NEW: createCapture, updateCapture, deleteCapture
    └── hashtags.ts                   # NEW: getHashtagsForUser, upsertHashtag
```

### Pattern 1: Server Component Shell + Client Island

Every authenticated page uses this two-component pattern. The Server Component performs the SSR data fetch; the Client island handles all interactivity.

```typescript
// app/(app)/tasks/page.tsx — Server Component
import { db } from "@/lib/db";
import { tasks, tasksProjects, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { TasksBoard } from "@/components/tasks/TasksBoard";

export default async function TasksPage() {
  const user = await getUserOrRedirect();
  
  const initialTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, user.id))
    .orderBy(tasks.createdAt);
  
  return <TasksBoard initialTasks={initialTasks} userId={user.id} />;
}

// components/tasks/TasksBoard.tsx — Client island
'use client';
export function TasksBoard({ initialTasks, userId }: Props) {
  // Client-side state for view toggle, filters, drag state
  // Phase 3 will add Realtime subscription here
}
```

### Pattern 2: Server Actions (D-17 architecture)

All mutations go through `app/actions/<domain>.ts`. Never call Drizzle from a Client Component directly.

```typescript
// app/actions/areas.ts
"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { areas } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

const CreateAreaSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().optional(),
  orderIndex: z.number().int().default(0),
});

export async function createArea(input: z.infer<typeof CreateAreaSchema>) {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) return { success: false, error: "Not authenticated" };
  
  const userId = claimsData.claims.sub;
  const parsed = CreateAreaSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  
  const [area] = await db.insert(areas).values({ ...parsed.data, userId }).returning();
  return { success: true, data: area };
}
```

Key rules for every Server Action:
- Always `getClaims()` — never `getSession()` (PITFALLS Pitfall 2)
- Validate with Zod before touching the DB
- Return `{ success: true, data }` or `{ success: false, error: string }` — never throw
- userId always derived server-side from claims — never trust client-supplied userId

### Pattern 3: @dnd-kit Kanban + List + Tree

Three separate drag contexts, each with its own `DndContext`:

**Kanban (cross-column drag changes status):**
```typescript
// components/tasks/KanbanBoard.tsx
'use client';
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor,
  PointerSensor, useSensor, useSensors
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

export function KanbanBoard({ tasks, onStatusChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)  // accessibility
  );
  
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  
  const statusColumns: TaskStatus[] = [
    'not started', 'up next', 'in progress', 'almost done', 'lesno'
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveTask(findTask(active.id))}
      onDragEnd={({ active, over }) => {
        if (!over) return;
        const newStatus = getColumnStatus(over.id);
        if (newStatus && newStatus !== activeTask?.status) {
          // Optimistic: update local state immediately
          // Then call Server Action to persist
          updateTaskStatusAction({ id: active.id, status: newStatus });
        }
        setActiveTask(null);
      }}
    >
      {statusColumns.map((status) => (
        <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]}>
          <SortableContext items={tasksByStatus[status].map(t => t.id)} strategy={verticalListSortingStrategy}>
            {tasksByStatus[status].map(task => <SortableTaskCard key={task.id} task={task} />)}
          </SortableContext>
        </KanbanColumn>
      ))}
      
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
```

**React 19 Strict Mode note:** @dnd-kit 6.3.x is compatible with React 19. Strict Mode mounts effects twice in dev — dnd-kit's sensors attach/cleanup cleanly in the double-mount cycle. No special workaround needed.

**Important:** Use `activationConstraint: { distance: 8 }` on PointerSensor. This prevents accidental drags when clicking task cards to open the detail panel (D-07). Without this, a click-and-slight-wiggle triggers drag mode.

### Pattern 4: Right-Side Detail Panel (D-07)

Use shadcn `Sheet` with `side="right"`. Do not use Dialog — Sheet already slides in from the right and has the correct semantics.

```typescript
// components/tasks/TaskDetailPanel.tsx
'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { motion, AnimatePresence } from "motion/react";

export function TaskDetailPanel({ task, open, onClose }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] p-0"
        // Motion override: UI-SPEC specifies 200ms ease-out slide-in
        // shadcn Sheet uses Radix Dialog under the hood which has its own animation
        // Override with data-[state=open] CSS for precise control
      >
        {/* Panel content */}
      </SheetContent>
    </Sheet>
  );
}
```

**URL state for "which task is open":** Use a URL search param `?task=<uuid>` so the detail panel survives page refresh. With nuqs:
```typescript
const [taskId, setTaskId] = useQueryState('task');
```

### Pattern 5: nuqs for Filter URL State (D-08)

nuqs `2.x` supports Next.js 16 (`next: >=14.2.0` peer dep). It wraps `useSearchParams` + `useRouter` with typed, batched updates.

```typescript
// components/tasks/TaskFilters.tsx
'use client';
import { useQueryStates, parseAsArrayOf, parseAsString } from 'nuqs';

const filterParsers = {
  priority: parseAsArrayOf(parseAsString).withDefault([]),
  status: parseAsArrayOf(parseAsString).withDefault([]),
  due: parseAsString.withDefault(''),
  project: parseAsString.withDefault(''),
};

export function TaskFilters() {
  const [filters, setFilters] = useQueryStates(filterParsers, {
    shallow: false, // update URL without full navigation
  });
  
  // filters.priority → string[], filters.status → string[], etc.
}
```

URL schema (per UI-SPEC):
```
/tasks?priority=P1,P2&status=in-progress,up-next&due=this-week&project=<uuid>&view=kanban
```

### Pattern 6: Cmd+K with shadcn Command

Mount once at `(app)/layout.tsx`. The shadcn `Command` component (which wraps cmdk) is a Dialog.

```typescript
// app/(app)/layout.tsx — expand existing layout
import { CommandMenu } from "@/components/shell/CommandMenu";
import { Toaster } from "sonner";

export default async function AppLayout({ children }) {
  await getUserOrRedirect();
  return (
    <AppShell>
      {children}
      <CommandMenu />   {/* Global Cmd+K — mounts once */}
      <Toaster position="bottom-right" duration={4000} />
    </AppShell>
  );
}
```

Cmd+K binding:
```typescript
// components/shell/CommandMenu.tsx
'use client';
import { useEffect } from 'react';
import { CommandDialog, CommandInput } from "@/components/ui/command";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* In Phase 2: renders the capture composer */}
      {/* In Phase 5: Kiwi replaces this content */}
      <CaptureComposer onSubmit={() => setOpen(false)} />
    </CommandDialog>
  );
}
```

### Pattern 7: Postgres Full-Text Search (CAPT-06)

Drizzle supports tsvector via `customType`. The generated column approach keeps search indexing automatic.

**Schema addition (new migration):**
```typescript
// lib/db/schema.ts — add to captures table
import { customType } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector'; }
});

// Inside captures pgTable definition:
contentSearch: tsvector('content_search')
  .generatedAlwaysAs((): SQL =>
    sql`to_tsvector('english', ${captures.content})`),
```

**Migration SQL (raw — add after drizzle-kit generate):**
```sql
-- Enable pg_trgm for similarity/trigram search (CAPT-06)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on the generated tsvector column
CREATE INDEX captures_content_search_gin_idx 
  ON captures USING gin(content_search);

-- Optional: pg_trgm GIN index for ILIKE-style substring search
CREATE INDEX captures_content_trgm_idx 
  ON captures USING gin(content gin_trgm_ops);
```

**Drizzle query for search (Server Action):**
```typescript
// app/actions/captures.ts
export async function searchCaptures(userId: string, query: string) {
  const tsQuery = query.trim().split(/\s+/).join(' & ');  // "hello world" → "hello & world"
  
  return await db
    .select()
    .from(captures)
    .where(
      and(
        eq(captures.userId, userId),
        sql`${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})`
      )
    )
    .orderBy(sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery})) DESC`)
    .limit(50);
}
```

**Note on pg_trgm:** Supabase has `pg_trgm` available by default on all projects. Enable via `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in a migration. No special Supabase console action needed.

### Anti-Patterns to Avoid

- **Calling Drizzle from Client Components:** Always use Server Actions for mutations. Client components receive data as props from their Server Component parent.
- **Using `getSession()` in Server Actions:** Use `getClaims()` (PITFALLS Pitfall 2, STACK.md security rule).
- **Importing all Lucide icons:** Static import of the full library adds ~2MB to the bundle. Use the `DynamicIcon` pattern (see below).
- **Skipping `activationConstraint` on PointerSensor:** Without it, clicking task cards triggers drag — disabling the detail panel click (D-07).
- **Using shadcn's Dialog for the task detail panel:** Use `Sheet` with `side="right"`. Dialog centers; Sheet slides from side.
- **Using raw `useSearchParams` + `useRouter` for filter state:** nuqs handles batching, SSR serialization, and TypeScript. Do not hand-roll.

---

## Critical Decision: The Chip Composer (CAPT-01, KIWI-02 prep)

This is the hardest UI piece in Phase 2. Three realistic options evaluated:

### Option A: Plain `<textarea>` + regex overlay div

A div positioned absolutely over the textarea, rendered only for display (not editable). JavaScript synchronizes scroll. Chip appearances are simulated by colored `<span>` elements in the overlay.

- **Bundle cost:** 0kb added
- **Accessibility:** Poor — the editable surface is a textarea; chips are decorative only
- **Cursor positioning:** Fundamentally broken — cursor lives in textarea coords but chips render in div coords; caret-to-chip alignment breaks on wrapped lines
- **Verdict:** DO NOT USE. Looks right in demos, breaks in production on all but the simplest inputs.

### Option B: `contenteditable` div with custom decoration

The composer is a `contenteditable` div. JavaScript watches `input` events, detects `#word` patterns, and replaces text runs with `<span class="chip">` elements.

- **Bundle cost:** 0kb added
- **Accessibility:** Acceptable if roles/aria-labels set correctly
- **Cursor positioning:** Correct — cursor lives in the same DOM as chips
- **Implementation complexity:** HIGH. Selection range management across chip insertions, backspace-to-delete-chip behavior, paste sanitization, IME support, cross-browser edge cases — all must be hand-rolled.
- **Phase 5 reuse:** Requires writing a custom autocomplete layer from scratch again for `$project` chips
- **Verdict:** Viable for MVP only if time is extremely tight. Technical debt is significant.

### Option C: TipTap 3.x + Mention extension (RECOMMENDED)

TipTap is a ProseMirror-based rich text framework. The `@tiptap/extension-mention` extension implements exactly the `#hashtag` / `$project` autocomplete + chip pattern.

- **Bundle cost:** ~50–80kb gzip (`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-mention`)
- **React 19 compatibility:** `@tiptap/react` 3.23.1 lists React 17/18/19 in peerDependencies. The React 19 integration was improved in 2.10.0 and carried into 3.x. The tippyjs-react dependency issue (GitHub issue #5876) only affects the PRO drag-handle extension — not `@tiptap/react` core or extension-mention. MEDIUM-HIGH confidence.
- **Accessibility:** TipTap uses ProseMirror's contenteditable under the hood with proper ARIA roles.
- **Autocomplete popup:** The Mention extension ships a suggestion system that plugs into any Popover/Floating UI component. Wire the shadcn Popover.
- **Phase 5 reuse:** The same TipTap editor config is reused for Kiwi's composer with an additional Mention extension for `$project` chips. Single implementation, two surfaces.
- **Cursor positioning:** Correct — ProseMirror handles all selection/range management.
- **Verdict: USE TIPTAP 3.x.** Bundle cost is ~70kb but it eliminates a large class of implementation risk.

**TipTap composer implementation sketch:**
```typescript
// components/captures/CaptureComposer.tsx
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { createHashtagSuggestion } from './hashtag-suggestion';

export function CaptureComposer({ hashtags, onSubmit }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need (reduces bundle from StarterKit)
        heading: false, codeBlock: false, bulletList: false, orderedList: false,
        blockquote: false, horizontalRule: false,
      }),
      Mention.configure({
        HTMLAttributes: { class: 'hashtag-chip' },
        suggestion: createHashtagSuggestion(hashtags),  // popover config
      }),
    ],
    editorProps: {
      attributes: { class: 'composer-input', 'data-placeholder': "What's on your mind? Use #tags to organize." },
    },
  });
  
  // Extract text + hashtag nodes from editor JSON, pass to Server Action
  const handleSubmit = async () => {
    const json = editor?.getJSON();
    const { content, hashtagNames } = parseEditorContent(json);
    await createCaptureAction({ content, hashtagNames });
    editor?.commands.clearContent();
  };
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop kanban | Custom mouse-event tracker | `@dnd-kit/core` + `@dnd-kit/sortable` | Keyboard accessibility, touch support, collision algorithms, React 19 StrictMode compat |
| Command palette (Cmd+K) | Custom modal + keyboard handler | `cmdk` via shadcn `Command` | Keyboard navigation, accessibility, fuzzy search built-in |
| Toast notifications | Custom portal + timeout manager | `sonner` | Stacking, undo queue, progress bar, a11y announcements |
| URL search param state | `useState` + `useEffect` sync | `nuqs` | Batching, SSR serialization, TypeScript types, history API |
| Hashtag chip composer | Custom contenteditable decorator | TipTap + Mention extension | ProseMirror handles cursor, IME, selection, backspace semantics |
| Full-text search index | Application-level string search | Postgres `tsvector` + GIN index | Server-side ranking (`ts_rank`), stop words, stemming, indexed performance |
| Icon lazy-loading | Custom dynamic import registry | Lucide's `dynamicIconImports` map | Already ships in lucide-react; zero boilerplate |
| Form validation | Manual state + error tracking | react-hook-form + zod | Uncontrolled perf, Zod integration, field-level errors |

**Key insight:** Every item on this list appears simple to hand-roll at first (2 hours each) and turns into a 2-day rabbit hole in production. The libraries exist specifically because these problems have non-obvious edge cases.

---

## Environment Availability

Phase 2 is primarily code/UI work. External dependencies are the Supabase project (already provisioned in Phase 1) and the Node/npm toolchain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All JS tooling | Yes | 20.18.1 | — |
| npm | Package install | Yes | 10.8.2 | — |
| Supabase CLI | Running migrations | Yes (via npx) | 2.98.2 | Use `npx supabase` |
| psql | Direct DB queries | Not installed locally | — | Use Supabase Studio SQL Editor |
| Supabase project | Data layer | Provisioned (Phase 1) | — | — |
| pg_trgm extension | CAPT-06 full-text search | Available on Supabase | — | Enable via migration SQL |

**Notes:**
- Supabase CLI is available via `npx supabase` — no global install required.
- `psql` is absent locally; use `npx supabase db studio` or Supabase Dashboard SQL Editor for manual DB inspection.
- All new npm packages can be installed without issue.

---

## Common Pitfalls

### Pitfall 1: @dnd-kit SortableContext `items` array must be IDs only

**What goes wrong:** Passing full task objects to `items` prop of `SortableContext`. The library compares items for identity; non-primitive values cause infinite re-renders.

**Prevention:** Always pass `tasks.map(t => t.id)` — a string/number array — not `tasks`.

### Pitfall 2: DragOverlay vs in-place drag rendering

**What goes wrong:** Without a `DragOverlay`, dnd-kit renders the dragged item in-place (invisible ghost). The card appears to disappear during drag.

**Prevention:** Always render a `<DragOverlay>` inside `DndContext`. It floats above all other content. Apply `scale(1.02)` and `shadow-lg` per UI-SPEC to the overlay card.

### Pitfall 3: hydration mismatch with filter URL state

**What goes wrong (PITFALLS Pitfall 16):** Server renders the tasks page without filter params (they're in the URL, not passed as server props). Client hydrates and nuqs reads the URL — they differ. React throws hydration warning.

**Prevention:** Pass filter params from `searchParams` prop of the page to the initial Server Component render so SSR output matches what nuqs will produce client-side:
```typescript
// tasks/page.tsx
export default async function TasksPage({ searchParams }) {
  const initialFilters = {
    priority: searchParams.priority?.split(',') ?? [],
    status: searchParams.status?.split(',') ?? [],
    // ...
  };
  return <TasksBoard initialFilters={initialFilters} />;
}
```

### Pitfall 4: TipTap `onUpdate` firing on every keystroke → Server Action spam

**What goes wrong:** Wiring `editor.onUpdate` directly to a Server Action call causes a network request per keystroke.

**Prevention:** Never auto-save in Phase 2. The composer is submit-on-button-click only. Save is triggered by the "Capture" button or Cmd+Enter.

### Pitfall 5: Lucide `dynamicIconImports` adds DEV server overhead

**What goes wrong:** Lucide's dynamic import map causes the dev server to pre-scan all 1000+ icon imports during compilation, slowing HMR.

**Prevention:** For the icon picker, use a **static curated array** of the 150 icon names (defined in the UI-SPEC) rather than the full `dynamicIconImports` map. Import only the 150 icons explicitly at build time in the picker component — they're known in advance.

```typescript
// components/projects/IconPicker.tsx
// Import only the curated 150 — not the full dynamicIconImports map
import {
  BookOpen, BookMarked, GraduationCap, Code2, Terminal, Music, /* ...150 total */
} from 'lucide-react';

const CURATED_ICONS = {
  BookOpen, BookMarked, GraduationCap, Code2, Terminal, Music, /* ...150 total */
};
```

This avoids the dynamic import dev-server overhead while keeping the bundle for the picker to exactly 150 icons (tree-shaking handles the rest).

### Pitfall 6: Projects table missing `order_index` — drag reorder silently fails

**What goes wrong:** D-03 requires projects to be draggable and reorderable. The current `projects` schema has no `orderIndex` column. Any attempt to persist project reorder via Server Action will fail at the Drizzle update call.

**Prevention:** Add the column via additive migration BEFORE implementing the sidebar tree drag (confirmed gap above).

### Pitfall 7: `getClaims()` vs `getSession()` in Server Actions

**What goes wrong (PITFALLS Pitfall 2):** Using `getSession()` in Server Actions doesn't revalidate the JWT — it's spoofable.

**Prevention:** Always call `supabase.auth.getClaims()`. The existing pattern in `apps/web/app/(app)/onboarding/actions.ts` shows the correct pattern — replicate it in all Phase 2 Server Actions.

### Pitfall 8: Archive toast Undo — naively implemented with no server rollback

**What goes wrong:** Toast shows "Area archived." with [Undo] button. If undo is only a UI state revert with no server action call, the archived state persists in DB on reload.

**Prevention:** The Undo button must call an `unarchiveArea` Server Action that sets `archivedAt = null`. Toast duration is 4000ms (UI-SPEC) — the undo window matches.

### Pitfall 9: Hashtag upsert race condition on simultaneous captures

**What goes wrong:** User rapidly submits two captures with the same new hashtag `#idea`. Both Server Actions hit the DB before either one's hashtag row is committed. Both try to insert `hashtags (user_id, name)` — one succeeds, the other fails the unique constraint.

**Prevention:** Use `INSERT ... ON CONFLICT (user_id, name) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING *`. This is an atomic upsert — the unique index already exists in the schema (`hashtags_user_name_uniq`).

```typescript
// In captures.ts Server Action:
const [hashtag] = await db
  .insert(hashtags)
  .values({ userId, name: tag.toLowerCase(), displayName: tag })
  .onConflictDoUpdate({
    target: [hashtags.userId, hashtags.name],
    set: { displayName: hashtags.displayName }, // keep first-seen casing (CAPT-08)
  })
  .returning();
```

---

## Code Examples

### Verified: Existing Server Action pattern (from onboarding/actions.ts)

```typescript
"use server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export async function myAction(input: unknown) {
  // 1. Get userId from JWT claims — never getSession()
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) return { success: false, error: "Not authenticated" };
  const userId = claimsData.claims.sub;
  
  // 2. Validate with Zod
  // 3. Drizzle mutation
  // 4. Return { success: true, data } or { success: false, error }
}
```

### Drizzle: Query with junction join for tasks + projects

```typescript
// Get all tasks for a user with linked project names
const tasksWithProjects = await db
  .select({
    task: tasks,
    project: { id: projects.id, name: projects.name },
  })
  .from(tasks)
  .leftJoin(tasksProjects, eq(tasksProjects.taskId, tasks.id))
  .leftJoin(projects, eq(projects.id, tasksProjects.projectId))
  .where(eq(tasks.userId, userId))
  .orderBy(tasks.createdAt);
```

### Drizzle: tsvector generated column + GIN index (new migration)

```typescript
// lib/db/schema.ts — inside captures table definition
import { customType, index } from "drizzle-orm/pg-core";
import { sql, SQL } from "drizzle-orm";

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector'; }
});

// In the captures pgTable:
contentSearch: tsvector('content_search')
  .generatedAlwaysAs((): SQL =>
    sql`to_tsvector('english', ${captures.content})`),
// Add in table constraints:
index("captures_content_search_gin_idx").using("gin", t.contentSearch),
```

### nuqs: Typed filter state

```typescript
'use client';
import { useQueryStates, parseAsArrayOf, parseAsString } from 'nuqs';

const [filters, setFilters] = useQueryStates({
  priority: parseAsArrayOf(parseAsString).withDefault([]),
  status: parseAsArrayOf(parseAsString).withDefault([]),
  due: parseAsString.withDefault(''),
  project: parseAsString.withDefault(''),
  view: parseAsString.withDefault('kanban'),
}, { shallow: false });
```

### sonner: Toast with Undo for archive actions

```typescript
import { toast } from 'sonner';

async function handleArchive(areaId: string) {
  await archiveAreaAction(areaId);
  toast("Area archived.", {
    action: {
      label: "Undo",
      onClick: () => unarchiveAreaAction(areaId),
    },
    duration: 4000,
  });
}
```

### DynamicIcon helper for project icon picker

```typescript
// components/projects/DynamicIcon.tsx
'use client';
import { CURATED_ICONS } from './icon-registry'; // static 150-icon map

interface Props {
  name: string;
  size?: number;
  className?: string;
}

export function DynamicIcon({ name, size = 16, className }: Props) {
  const Icon = CURATED_ICONS[name as keyof typeof CURATED_ICONS];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
```

### Banner parsing helper

```typescript
// lib/utils/banner.ts
export function parseBanner(bannerUrl: string | null): string {
  if (!bannerUrl) return 'hsl(42, 18%, 97%)'; // Parchment default
  if (bannerUrl.startsWith('solid:')) return bannerUrl.slice(6);
  if (bannerUrl.startsWith('gradient:')) return bannerUrl.slice(9);
  return bannerUrl; // fallback: treat as raw CSS value
}
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `react-beautiful-dnd` | `@dnd-kit/core` + `@dnd-kit/sortable` | RBD deprecated; dnd-kit is the 2026 standard |
| `framer-motion` | `motion` (import from `motion/react`) | Package renamed; old package in maintenance mode |
| `useSearchParams` + manual router.push for URL state | `nuqs` | nuqs removes boilerplate; typed, batched, SSR-safe |
| `middleware.ts` | `proxy.ts` | Next.js 16 renamed the file |
| `getSession()` server-side | `getClaims()` | Supabase security change — getClaims validates JWT |
| Global css variables in `tailwind.config.js` | `@theme` blocks in `globals.css` | Tailwind 4 CSS-first config |
| Component-level toast state | `sonner` global Toaster + `toast()` calls | Sonner is the shadcn-blessed approach for 2026 |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Deprecated. Use `@supabase/ssr`.
- `react-beautiful-dnd`: Deprecated by Atlassian. Use `@dnd-kit`.
- `framer-motion` direct import: Use `motion` package with `motion/react` import path.

---

## Open Questions

1. **TipTap 3.x React 19 production stability**
   - What we know: React 19 peerDep declared; core works; PRO extensions have known issues (tippyjs-react), but extension-mention does NOT depend on tippyjs-react.
   - What's unclear: Whether there are any unreported runtime warnings in strict mode React 19 + TipTap 3.23.x.
   - Recommendation: Install and run a smoke test in the composer before committing the full implementation. If issues arise, fall back to Option B (contenteditable) with a clear implementation plan.

2. **Drizzle `generatedAlwaysAs` + `customType` compatibility in 0.36.x**
   - What we know: Drizzle docs show generated column support; `customType` is documented; the pattern is used in community examples.
   - What's unclear: Whether `generatedAlwaysAs` + `customType` combination works in Drizzle 0.36.x (the installed version) vs. the newer 0.45.x (current npm latest).
   - Recommendation: The planner should include a Wave 0 task to verify this pattern compiles and generates correct migration SQL before building the search feature. If it fails, use a raw SQL migration instead of the Drizzle schema approach.

3. **`@dnd-kit/sortable` 10.0.0 vs `@dnd-kit/core` 6.3.1 version parity**
   - What we know: `@dnd-kit/sortable@10.0.0` declares peer dep `@dnd-kit/core: ^6.3.0` — they are compatible.
   - What's unclear: Whether the major version jump in sortable (from 9.x to 10.x) introduced any breaking API changes relevant to this implementation.
   - Recommendation: Use the versions as specified. The peer dep check confirms compatibility. No action needed.

---

## Project Constraints (from CLAUDE.md)

Directives extracted from `CLAUDE.md` that apply to Phase 2 implementation:

| Directive | Category | Notes |
|-----------|----------|-------|
| Use GSD workflow entry points (`/gsd:execute-phase`) for all work | Workflow | Do not make direct repo edits outside GSD |
| Secrets in env only — never commit `.env.local` | Security | Pre-commit gitleaks hook from Phase 1 |
| `getClaims()` not `getSession()` in server code | Auth | Enforced by STACK.md + PITFALLS.md |
| `proxy.ts` not `middleware.ts` | Next.js | Next.js 16 naming |
| `prepare: false` on postgres-js driver | DB | Required for Supabase pooler |
| TypeScript strict mode | Code quality | Non-negotiable per CLAUDE.md |
| EB Garamond for content text, Inter/system-ui for dense UI chrome | Typography | Per UI-SPEC; not a suggestion |
| Accent color `#D4A027` used only for the 8 reserved cases in UI-SPEC | Color | Do not use accent for buttons or hover backgrounds |
| Brand voice: Genz-Renaissance; "Cancel" never used as CTA label | Copy | Use "Never mind" / "Discard changes" instead |
| Drizzle migrations only — no SQL Editor alterations in production | DB | All schema changes via migration files |
| Service role key only in `app/api/**` | Security | Never in client components or Server Actions that touch client data |
| Vitest for critical path tests | Testing | CLAUDE.md defers UI tests for MVP |

---

## Sources

### Primary (HIGH confidence)
- `apps/web/lib/db/schema.ts` — Verified: `areas` has `orderIndex`, `projects` does NOT (schema gap confirmed)
- `apps/web/lib/db/enums.ts` — Verified: `priority`, `task_status`, `semester_term` enum literals
- `apps/web/package.json` — Verified installed versions: Next 16, React 19.2, Drizzle 0.36, @supabase/ssr 0.10
- `npm view` results — Verified: @dnd-kit/core@6.3.1, @dnd-kit/sortable@10.0.0 (peerDep: @dnd-kit/core ^6.3.0 — compatible), cmdk@1.1.1, sonner@2.0.7, nuqs@2.8.9, motion@12.38.0
- [Drizzle ORM Full-Text Search with Generated Columns](https://orm.drizzle.team/docs/guides/full-text-search-with-generated-columns) — tsvector customType + GIN index pattern
- [TipTap React installation docs](https://tiptap.dev/docs/editor/getting-started/install/react) — React 19 peer dep confirmed in @tiptap/react 3.23.1
- [nuqs GitHub](https://github.com/47ng/nuqs) — Next.js >=14.2.0 support confirmed; React 19 peerDep declared

### Secondary (MEDIUM confidence)
- [TipTap React 19 compatibility issue #5816](https://github.com/ueberdosis/tiptap/discussions/5816) — Core issue is tippyjs-react in PRO extensions; extension-mention is NOT affected
- [Lucide dynamic import dev server overhead issue #1576](https://github.com/lucide-icons/lucide/issues/1576) — Static curated map recommended for icon picker
- WebSearch: @dnd-kit React 19 strict mode — no known incompatibility; peer dep is `react: >=16.8.0`

### Tertiary (LOW confidence — flag for validation)
- TipTap 3.23.1 strict mode React 19 runtime behavior — not independently verified against this exact version combination; smoke test recommended before full implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack (locked libs): HIGH — versions npm-verified
- New lib additions (@dnd-kit, cmdk, sonner, nuqs, motion): HIGH — npm versions confirmed, peer deps checked
- TipTap 3.x for chip composer: MEDIUM-HIGH — core React 19 compat confirmed; strict mode behavior not exhaustively verified
- Architecture patterns: HIGH — follows established Phase 1 patterns + official Next.js 16 idioms
- Schema gap (projects missing orderIndex): HIGH — directly read from schema.ts
- tsvector generated column via Drizzle: MEDIUM — official Drizzle docs show pattern; Drizzle 0.36 vs 0.45 not cross-verified
- Pitfalls: HIGH — most derive from PITFALLS.md (pre-researched) + direct code inspection

**Research date:** 2026-05-07
**Valid until:** 2026-08-01 (stable stack; 90-day window; re-verify TipTap major version if more than 2 months pass before execution)
