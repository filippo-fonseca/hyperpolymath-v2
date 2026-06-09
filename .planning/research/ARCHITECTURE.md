# Architecture Research

**Domain:** Personal life-OS web app with NLP agent (Hyperpolymath v2)
**Researched:** 2026-05-07
**Confidence:** HIGH for stack/route patterns; MEDIUM for Kiwi internals (decisions justified by v1 lessons + 2026 SDK shape)

---

## 1. System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React 19)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Kiwi Console │  │  Tabs (RSC)  │  │ Sidebar Tree │              │
│  │  (Client)    │  │  + Client    │  │  (Client)    │              │
│  │  useChat()   │  │  islands     │  │  realtime    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼──────────────────────┘
          │ POST /api/kiwi  │ Server Action   │ Realtime channel
          │ (SSE stream)    │ (mutations)     │ (WebSocket)
┌─────────▼─────────────────▼─────────────────▼──────────────────────┐
│                    NEXT.JS APP ROUTER (Vercel)                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │  Route Handlers  │  │ Server Actions   │  │ Server Components│  │
│  │  /api/kiwi (SSE) │  │ create/update/   │  │ data fetching   │   │
│  │  /api/gcal/*     │  │ delete domain    │  │ initial render  │   │
│  │  /api/auth/*     │  │ entities         │  │                 │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬────────┘   │
│           │                     │                     │            │
│  ┌────────▼─────────────────────▼─────────────────────▼────────┐   │
│  │              packages/kiwi-core (pure logic)                │   │
│  │  buildContext() | runAgent() | executeAction() | schemas    │   │
│  └────────┬────────────────────┬────────────────────┬──────────┘   │
└───────────┼────────────────────┼────────────────────┼──────────────┘
            │                    │                    │
┌───────────▼────────┐  ┌────────▼─────────┐  ┌──────▼───────────┐
│   Anthropic API    │  │ Supabase Postgres│  │  Google Calendar │
│   Sonnet 4.6       │  │  + Auth          │  │  REST API        │
│   tool_use mode    │  │  + Realtime      │  │  (per-request)   │
│                    │  │  + Storage       │  │                  │
└────────────────────┘  └──────────────────┘  └──────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Kiwi Console** | Single chat-like input; renders streaming agent output, intent badges, action confirmation | Client Component, Vercel AI SDK `useChat`, custom token autocomplete |
| **Tabs (Tasks/Captures/Calendar/Project page)** | CRUD UIs over each domain | Server Component for initial fetch + Client island for realtime/mutations |
| **Sidebar Tree** | Areas → Projects navigation; live counts | Client Component with Realtime subscriptions on `areas`/`projects` |
| **Route Handlers** | SSE stream for `/api/kiwi`; Google OAuth callback; webhook surface | `app/api/*/route.ts`, Node runtime |
| **Server Actions** | Idiomatic typed mutations from forms/buttons (create task, update capture, etc.) | `"use server"` functions per domain |
| **Server Components** | First-paint data; reads scoped via `@supabase/ssr` server client | Default in App Router |
| **`packages/kiwi-core`** | Pure agent logic (prompt assembly, context build, action schema, action executor) — shared by web today, CLI later | TypeScript library, peer-deps `@supabase/supabase-js` and `@anthropic-ai/sdk` |
| **Supabase Postgres** | Source of truth for areas/projects/tasks/captures/hashtags + OAuth tokens | RLS policies on every table |
| **Supabase Realtime** | Push live row deltas to clients | Postgres changes channels per table, filtered by `user_id` |
| **Google Calendar API** | Source of truth for calendar events; never mirrored in Postgres | On-demand fetch from Server Components/Actions |
| **Anthropic SDK** | Sonnet 4.6 with strict tool_use for the multi-action contract | Called server-side from `kiwi-core` |

---

## 2. Recommended Project Structure

```
hyperpolymath-v2/
├── app/
│   ├── (marketing)/                    # Public landing (no auth)
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── (app)/                          # Auth-gated route group
│   │   ├── layout.tsx                  # Server Component: fetches user, gates access
│   │   ├── page.tsx                    # Homescreen = Kiwi console
│   │   ├── tasks/page.tsx              # Kanban + list view
│   │   ├── captures/
│   │   │   ├── page.tsx                # Feed
│   │   │   └── [hashtag]/page.tsx      # Filtered feed
│   │   ├── calendar/page.tsx           # gcal CRUD operator
│   │   ├── projects/[id]/page.tsx      # Notion-style project page
│   │   ├── areas/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── kiwi/route.ts               # SSE streaming endpoint
│   │   ├── gcal/
│   │   │   ├── auth/route.ts           # OAuth init
│   │   │   ├── callback/route.ts       # OAuth callback
│   │   │   ├── events/route.ts         # List events for window
│   │   │   ├── event/route.ts          # POST/PATCH/DELETE single event
│   │   │   └── status/route.ts         # Token health
│   │   └── auth/
│   │       └── callback/route.ts       # Supabase OAuth code exchange
│   ├── actions/                        # Server Actions, grouped by domain
│   │   ├── tasks.ts
│   │   ├── captures.ts
│   │   ├── projects.ts
│   │   ├── areas.ts
│   │   └── hashtags.ts
│   ├── layout.tsx                      # Root: fonts, ThemeProvider
│   └── middleware.ts                   # Supabase session refresh on every request
├── components/
│   ├── kiwi/                           # Console UI (textarea, autocomplete, stream)
│   ├── tasks/, captures/, projects/,   # Per-domain components
│   │   areas/, calendar/
│   ├── shell/                          # AppShell, sidebar tree, tabs
│   └── ui/                             # Primitives (Button, Modal, etc.)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                   # createServerClient (per-request)
│   │   ├── client.ts                   # createBrowserClient
│   │   └── middleware.ts               # createServerClient for middleware
│   ├── google-calendar/
│   │   ├── client.ts                   # OAuth client + refresh helper
│   │   └── operations.ts               # listEvents, createEvent, etc.
│   ├── realtime/
│   │   └── use-table-subscription.ts   # Hook wrapping channel lifecycle
│   ├── parsers/                        # Date/time/priority/project-ref parsers
│   └── types/                          # Generated DB types + domain types
├── packages/
│   └── kiwi-core/                      # Shared agent library
│       ├── src/
│       │   ├── prompt.ts               # System prompt assembly
│       │   ├── context.ts              # buildContext(supabase, userId)
│       │   ├── tools.ts                # Anthropic tool schemas
│       │   ├── agent.ts                # runAgent({ message, context }) → SSE stream
│       │   ├── execute.ts              # executeAction(action, supabase, userId)
│       │   └── types.ts                # KiwiAction, KiwiResponse
│       └── package.json                # Workspace package
├── supabase/
│   ├── migrations/                     # SQL migrations (committed)
│   ├── seed.sql                        # Seed data (areas, hashtags)
│   └── config.toml
├── tests/                              # Vitest: parsers + agent contract
└── package.json                        # npm workspace root
```

### Structure Rationale

- **`(app)/` route group:** Single layout-level auth gate (per Next.js best practices) replaces v1's per-page `onAuthStateChanged` boilerplate. The `(marketing)/` group keeps the landing public.
- **`app/actions/` per domain:** Server Actions are the idiomatic 2026 mutation primitive. Co-locating by domain (not by page) allows the Kiwi executor to import the same functions used by manual UI — single mutation path.
- **`packages/kiwi-core/`:** v1's load-bearing factoring. Web consumes it today; CLI consumes it later without forking the agent. Pure logic, no React, no Next.
- **`lib/supabase/` triple-client:** `@supabase/ssr` requires three client variants (server, browser, middleware) — the modern pattern as of 2026.
- **`supabase/migrations/`:** Schema in version control (v1 had Firestore rules only in console — v2 fixes this).

---

## 3. Schema Design (Postgres on Supabase)

### Enums

```sql
create type priority as enum ('P∞', 'P1', 'P2', 'P3');
create type task_status as enum (
  'not started', 'up next', 'in progress', 'almost done', 'lesno'
);
create type semester as enum (
  'fall', 'spring', 'summer'  -- combined with year column
);
```

The `P∞` literal is preserved as-is per v1 non-negotiables. Postgres enums accept Unicode.

### Core Tables

```sql
-- Users (mirrors auth.users for app-side metadata)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  graduation_year int,                 -- drives semester options
  theme text default 'light',
  gcal_refresh_token text,             -- encrypted via pgcrypto, see §5
  gcal_access_token text,
  gcal_token_expires_at timestamptz,
  created_at timestamptz default now()
);

-- Areas
create table areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  emoji text,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index areas_user_idx on areas (user_id) where archived_at is null;

-- Projects (with isClass discriminator + nullable class metadata)
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  area_id uuid not null references areas(id) on delete restrict,
  name text not null,
  description text,
  icon text,
  banner_url text,
  start_date date,
  end_date date,                       -- nullable = indefinite
  archived_at timestamptz,

  -- Class fields (nullable; only populated when is_class=true)
  is_class boolean not null default false,
  course_code text,                    -- e.g., 'ANTH 2480'
  course_title text,                   -- e.g., 'Anthropology of Money'
  instructor text,
  grade text,
  semester_term semester,
  semester_year int,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Integrity: class fields require is_class=true
  constraint class_fields_consistent check (
    (is_class = false and course_code is null and course_title is null
      and semester_term is null and semester_year is null)
    or (is_class = true)
  )
);
create index projects_user_area_idx on projects (user_id, area_id) where archived_at is null;
create index projects_user_class_idx on projects (user_id, is_class) where is_class = true;

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  notes text,
  priority priority not null default 'P3',
  status task_status not null default 'not started',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index tasks_user_status_idx on tasks (user_id, status);
create index tasks_user_due_idx on tasks (user_id, due_date) where due_date is not null;

-- Captures
create table captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index captures_user_created_idx on captures (user_id, created_at desc);

-- Hashtags (auto-created on first use; per-user namespace)
create table hashtags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,                  -- without leading #
  created_at timestamptz default now(),
  unique (user_id, name)
);
create index hashtags_user_idx on hashtags (user_id);
```

### Junction Tables (M2M)

```sql
-- Tasks ↔ Projects
create table task_projects (
  task_id uuid not null references tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,               -- denormalized for RLS perf
  primary key (task_id, project_id)
);
create index task_projects_project_idx on task_projects (project_id);
create index task_projects_user_idx on task_projects (user_id);

-- Captures ↔ Projects
create table capture_projects (
  capture_id uuid not null references captures(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  primary key (capture_id, project_id)
);
create index capture_projects_project_idx on capture_projects (project_id);
create index capture_projects_user_idx on capture_projects (user_id);

-- Captures ↔ Hashtags
create table capture_hashtags (
  capture_id uuid not null references captures(id) on delete cascade,
  hashtag_id uuid not null references hashtags(id) on delete cascade,
  user_id uuid not null,
  primary key (capture_id, hashtag_id)
);
create index capture_hashtags_hashtag_idx on capture_hashtags (hashtag_id);
create index capture_hashtags_user_idx on capture_hashtags (user_id);
```

**Why denormalize `user_id` on junction tables:** RLS policies need to filter by `user_id` without recursive lookups into parent tables. Avoids the [recursive policy trap](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) and keeps junction reads cheap.

### Discriminator Decision: Single Table vs Separate `classes` Table

**Decision: Single `projects` table with nullable class fields + CHECK constraint.**

Rationale:
- v1 used this exact pattern (`isClass: boolean` + flat optional fields) — proven to work
- Class metadata is small (~5 nullable columns); space waste is negligible
- All queries are polymorphic (sidebar shows projects + classes mixed) — single table avoids JOINs on the hot path
- Single Table Inheritance is the [recommended choice when subtype-specific columns are few and queries are polymorphic](https://medium.com/@artemkhrenov/table-inheritance-patterns-single-table-vs-class-table-vs-concrete-table-inheritance-1aec1d978de1)
- The CHECK constraint enforces integrity (no orphaned class fields when `is_class=false`)

Tradeoff accepted: Cannot enforce NOT NULL on `course_code` etc. at the column level. Application validation + the CHECK constraint compensate.

### RLS Policies

Enable on every table:

```sql
alter table areas enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table captures enable row level security;
alter table hashtags enable row level security;
alter table task_projects enable row level security;
alter table capture_projects enable row level security;
alter table capture_hashtags enable row level security;
```

Standard policy pattern (apply to all primary tables):

```sql
create policy "users own their areas"
  on areas for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

**Performance note:** wrap `auth.uid()` in `(select ...)` so Postgres caches the result per query (Supabase RLS performance best practice). Without this wrapper, `auth.uid()` is called per row.

For junction tables, use the denormalized `user_id` directly:

```sql
create policy "users own their task_projects"
  on task_projects for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

This sidesteps the recursive-lookup pitfall.

**Multi-user readiness:** Because every table already filters by `user_id` and Supabase Auth ties `user_id` to `auth.users.id`, going multi-user requires zero schema changes — only opening signup.

### Hot Read-Path Indexes

| Query | Index |
|-------|-------|
| Tasks for user, by status (kanban) | `tasks_user_status_idx` |
| Tasks for user, due today/soon | `tasks_user_due_idx` (partial: `where due_date is not null`) |
| Captures for user, newest first | `captures_user_created_idx` (DESC) |
| Captures for user filtered by hashtag | join via `capture_hashtags_hashtag_idx` |
| Projects for user, by area (sidebar tree) | `projects_user_area_idx` (partial: not archived) |
| Classes only | `projects_user_class_idx` (partial: `where is_class = true`) |
| Areas for user (sidebar) | `areas_user_idx` (partial: not archived) |

Partial indexes save space and speed up the common "active items only" view.

---

## 4. Component Boundaries (Next.js App Router)

### Server vs Client Component Rules

| Use Server Component when... | Use Client Component when... |
|------------------------------|------------------------------|
| Initial data fetch from Supabase | User input/interactivity (forms, buttons w/ state) |
| Auth gate / redirect logic | Realtime subscription needed |
| Static layout/shell | Streaming chat (Kiwi console) |
| SEO-relevant pages | Hover/animation/keyboard handlers |

**Pattern: Server Component shell + Client island for live data.**

```typescript
// app/(app)/tasks/page.tsx — Server Component
export default async function TasksPage() {
  const supabase = await createServerClient();
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, task_projects(project_id, projects(name))')
    .order('created_at', { ascending: false });

  return <TasksBoard initialTasks={tasks ?? []} />;
}

// components/tasks/TasksBoard.tsx — Client Component
'use client';
export function TasksBoard({ initialTasks }: Props) {
  const tasks = useRealtimeTasks(initialTasks);  // hydrates from realtime
  // ... kanban rendering, drag/drop, mutations via Server Actions
}
```

This pattern gives a fast first paint (SSR) without losing realtime updates.

### Server Actions vs API Routes (2026 idiom)

**Use Server Actions for:** All in-app mutations (create task, update capture, archive project, etc.). They're type-safe, work with `<form action={}>`, integrate with `revalidatePath`, and simplify the mutation path.

**Use Route Handlers for:**
- `/api/kiwi` — needs SSE streaming (Server Actions don't stream nicely)
- `/api/gcal/*` — webhooks/callbacks must be public URLs
- `/api/auth/callback` — Supabase OAuth code exchange

This split is the [current 2026 idiom per Next.js docs](https://nextjs.org/docs/app/getting-started/route-handlers) and per [community guidance](https://www.wisp.blog/blog/server-actions-vs-api-routes-in-nextjs-15-which-should-i-use): Server Actions for app-internal mutations, Route Handlers for external/streaming surfaces.

### Where Kiwi Lives

```
Client (Kiwi Console)
  ↓ POST /api/kiwi { message, sessionHistory }
Route Handler (Node runtime, NOT Edge)
  ↓ calls kiwi-core.runAgent()
kiwi-core
  ↓ buildContext(supabase, userId) — fetches projects, recent tasks, gcal list, hashtags
  ↓ Anthropic SDK with tool_use stream
  ↓ as tool_use blocks complete, executeAction(action, supabase, userId)
  ↓ stream tokens + intent badges back to client
```

**Why Node runtime, not Edge:** Anthropic SDK + Supabase server client + Google Calendar OAuth refresh all work on Node. Edge runtime adds friction (no Node APIs, smaller package limits) for no clear win on a low-volume single-user app. Reconsider Edge if cold starts become user-visible.

**Why a Route Handler, not a Server Action:** Server Actions don't have first-class SSE support. The Kiwi UX requires word-by-word streaming with the thinking-word indicator. A Route Handler returning a `Response` with a `ReadableStream` is the cleanest path.

### Auth-Gated Route Groups

`(app)/layout.tsx` becomes the single auth gate:

```typescript
// app/(app)/layout.tsx
export default async function AppLayout({ children }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');
  return <AppShell user={user}>{children}</AppShell>;
}
```

Combined with `middleware.ts` (which refreshes the Supabase session cookie on every request via `@supabase/ssr`), this replaces v1's per-page `onAuthStateChanged` calls.

**Important:** Per [Supabase 2026 guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), use `getUser()` (validates JWT) in server code, not `getSession()` (does not validate). Only use `getSession()` in the browser.

---

## 5. Kiwi Agent Architecture

### Prompt Storage

**Decision: Source-controlled, in `packages/kiwi-core/src/prompt.ts`.**

Pros: Versioned alongside code, code review for changes, no extra DB round-trip per call, deployment is atomic.
Cons: Requires deploy to update.

**Reject database-stored prompts** for v2: Hot-swap is overkill for a single-user app, and code-controlled prompts are reproducible (tests can pin a prompt version). Revisit if multi-user happens and you need A/B prompt experiments.

### Tool Use vs Structured Output

**Decision: Strict tool_use mode** (Anthropic's tool-use API with `strict: true`).

Anthropic now offers two structured-output modes for Sonnet 4.5/4.6:
1. **JSON mode** — model emits a JSON object matching a schema
2. **Strict tool_use** — model picks one or more tool calls with validated args

Tool use fits Kiwi's multi-action contract better:
- Each action type (`create_task`, `create_capture`, `create_event`) is a separate tool with its own schema → cleaner than one mega-schema
- The model can emit multiple tool_use blocks in one response (the "lunch with sam + pick up groceries" example)
- Strict mode guarantees the args validate, eliminating the v1 class of "model forgot a required field" bugs
- Native streaming: tool_use blocks stream incrementally, so the UI can show intent badges as they arrive (matches the v1 UX)

Tool surface for MVP (creation only):

```typescript
const tools = [
  {
    name: 'create_task',
    description: 'Create a to-do task with priority, due date, and optional project links',
    input_schema: { /* title, priority, status, dueDate, projectIds */ },
    strict: true,
  },
  {
    name: 'create_capture',
    description: 'Save a freeform thought, observation, or note',
    input_schema: { /* content, hashtags[], projectIds[] */ },
    strict: true,
  },
  {
    name: 'create_event',
    description: 'Schedule an event on the user\'s Google Calendar',
    input_schema: { /* title, calendarId, start, end, description */ },
    strict: true,
  },
];
```

Post-MVP: add `update_*` and `delete_*` tools, and a `pendingActions` confirmation flow (matches v1 non-negotiable: confirm-before-destructive).

### Context Injection

`buildContext(supabase, userId)` runs before the Anthropic call and packs:

```typescript
type KiwiContext = {
  today: string;                     // YYYY-MM-DD
  weekday: string;                   // 'Wednesday'
  next14Days: { date: string; weekday: string }[];
  areas: { id: string; name: string; emoji: string }[];
  projects: { id: string; name: string; areaName: string; isClass: boolean; courseCode?: string }[];
  recentTasks: { id: string; title: string; status: string; dueDate?: string }[];  // last 10
  recentCaptures: { id: string; content: string }[];                                // last 5
  hashtags: string[];                                                               // top 20 by use
  calendars: { id: string; name: string }[];                                        // gcal calendars
  todayAndTomorrowEvents: { id: string; title: string; start: string }[];           // for "what's on my plate"
};
```

This mirrors v1's context shape (proven to make fuzzy project matching work). Fetch all in parallel via `Promise.all` to keep Kiwi responsive (target: <300ms context-build budget).

### Streaming Pattern

Use **Vercel AI SDK `streamText` + Anthropic provider** in the Route Handler. As of 2026 the SDK has first-class Anthropic support with tool_use streaming, and `useChat` on the client handles the SSE protocol automatically.

```typescript
// app/api/kiwi/route.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { runAgent } from '@hyperpolymath/kiwi-core';

export async function POST(req: Request) {
  const { message, history } = await req.json();
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const context = await buildContext(supabase, user.id);

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: buildSystemPrompt(context),
    messages: [...history, { role: 'user', content: message }],
    tools: kiwiTools,
    onFinish: async ({ toolCalls }) => {
      // Execute tool calls server-side (creation only in MVP)
      for (const call of toolCalls) {
        await executeAction(call, supabase, user.id);
      }
    },
  });

  return result.toDataStreamResponse();
}
```

Client side, `useChat()` from `@ai-sdk/react` handles streaming, message state, and tool-call rendering. Custom UI overlays (thinking-word indicator, intent badges per action) wrap around it.

### Web ↔ CLI Sharing Boundary

`packages/kiwi-core` exports the agent surface; web and CLI are pure consumers:

| Function | Web caller | CLI caller (future) |
|----------|------------|---------------------|
| `buildContext(supabase, userId)` | Inside `/api/kiwi` route | Inside CLI entry |
| `runAgent({ message, context, history })` | Inside `/api/kiwi` route | Inside CLI entry |
| `executeAction(action, supabase, userId)` | Inside `/api/kiwi` `onFinish` | Inside CLI |
| Schemas/types | Type-only imports | Type-only imports |

Critical: `kiwi-core` must **not** import from `next/*`, `react/*`, or any UI lib. It depends only on `@anthropic-ai/sdk` and `@supabase/supabase-js` (peer deps). This is the v1 lesson — keep core pure so the CLI can drop in without surgery.

---

## 6. Realtime Data Flow

### Channel Strategy

**Per-table channels, filtered by `user_id`** (not per-user mega-channel):

```typescript
const channel = supabase
  .channel('tasks-changes')
  .on('postgres_changes', {
    event: '*',                       // INSERT | UPDATE | DELETE
    schema: 'public',
    table: 'tasks',
    filter: `user_id=eq.${userId}`,
  }, handleChange)
  .subscribe();
```

Why per-table:
- Components subscribe only to what they show (Tasks page doesn't get capture deltas)
- Easier to reason about cleanup
- Supabase pushes only matching rows (cheap)

Single-user app makes the `filter=eq.user_id` redundant for security (RLS handles that), but it's still useful as a wire-level filter to avoid unnecessary deltas.

### Subscription Lifecycle Hook

Wrap the boilerplate in a reusable hook:

```typescript
// lib/realtime/use-table-subscription.ts
export function useTableSubscription<T>(
  table: string,
  userId: string,
  initial: T[],
  getId: (row: T) => string,
): T[] {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`${table}-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table,
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setRows(prev => [payload.new as T, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setRows(prev => prev.map(r =>
            getId(r) === getId(payload.new as T) ? payload.new as T : r
          ));
        } else if (payload.eventType === 'DELETE') {
          setRows(prev => prev.filter(r => getId(r) !== getId(payload.old as T)));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, userId]);

  return rows;
}
```

**Always** clean up in the effect return — uncleaned subscriptions are the #1 cause of memory leaks and ghost updates.

### Optimistic Updates Without Echo Conflicts

Realtime echoes back your own writes. Naive optimistic updates double-apply.

**Pattern: dedupe by ID.**

```typescript
const optimistic = { id: crypto.randomUUID(), title: 'New task', /* ... */ };
setRows(prev => [optimistic, ...prev]);
await createTaskAction(optimistic);    // Server inserts with the same ID

// Realtime INSERT arrives → handler checks: is this ID already in state?
// If yes: replace (in case server enriched it); if no: prepend.
```

Generate UUIDs client-side and pass them to the server. The server uses the provided ID as primary key. Realtime echo deduplicates by ID match.

For destructive actions (delete): show pending state, don't optimistically remove until server confirms or realtime delete arrives. ([per 2026 best practices](https://app.studyraid.com/en/read/8395/231602/managing-real-time-subscriptions))

---

## 7. Google Calendar Architecture

### Token Storage

**Where:** `users` table columns (`gcal_refresh_token`, `gcal_access_token`, `gcal_token_expires_at`).

**Encryption:** Use Postgres `pgcrypto` to encrypt the refresh token at rest. Decryption happens server-side only when refreshing. Never expose tokens to the client.

```sql
-- Set at deploy time, never in code:
-- alter database your_db set app.gcal_token_key = '<random>';

-- Insert path:
update users set
  gcal_refresh_token = pgp_sym_encrypt(:plain, current_setting('app.gcal_token_key'))
where id = :user_id;

-- Read path (server-side only):
select pgp_sym_decrypt(gcal_refresh_token::bytea, current_setting('app.gcal_token_key'))
from users where id = :user_id;
```

**Why on `users`, not separate `oauth_tokens` table:** v1 stored on user doc and it worked. Single integration, single user — no need for normalization. If more OAuth integrations land later (Strava, etc.), refactor to `oauth_credentials` table keyed by `(user_id, provider)`.

### On-Demand Fetch (No Caching Layer)

Per `core.md` and PROJECT.md: events are NOT stored in Postgres. The Calendar tab fetches fresh on page load.

```typescript
// app/(app)/calendar/page.tsx
export default async function CalendarPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const accessToken = await getValidGcalToken(supabase, user.id);  // refreshes if expired
  const events = await listCalendarEvents(accessToken, weekStart, weekEnd);
  return <CalendarView initialEvents={events} />;
}
```

`getValidGcalToken()` checks `gcal_token_expires_at`, refreshes via Google's token endpoint if needed, persists new tokens. This is the proven v1 pattern.

**No background polling**, no cron, no service worker — explicitly out of scope.

### Kiwi Composing Calendar + Task in One Turn

Kiwi's executor processes tool_use blocks in order:

```typescript
// kiwi-core/src/execute.ts
export async function executeAction(action, supabase, userId) {
  switch (action.name) {
    case 'create_task':
      return supabase.from('tasks').insert({ ...action.input, user_id: userId });
    case 'create_capture':
      // ... handle hashtag upsert + junction inserts in a transaction
      return createCaptureWithTags(action.input, supabase, userId);
    case 'create_event':
      const token = await getValidGcalToken(supabase, userId);
      return createCalendarEvent(token, action.input);
  }
}
```

**Atomicity:** No cross-system transaction (Postgres + gcal). If gcal fails after task succeeds, surface the partial result honestly in the UI ("Task created. Calendar event failed — retry?"). v1 does the same; users tolerate it because the failure mode is rare and visible.

---

## 8. Data Flow Summary

### Manual CRUD Flow (e.g., user clicks "Add Task")

```
User clicks button in TasksBoard (Client Component)
  ↓
Form action → createTaskAction() (Server Action)
  ↓
createServerClient() → supabase.from('tasks').insert(...)
  ↓
RLS validates auth.uid() == user_id
  ↓
Postgres trigger → Realtime broadcast on 'tasks' channel
  ↓
All open clients with subscription receive INSERT delta
  ↓
useTableSubscription dedupes by ID, updates state
```

### Kiwi Flow (e.g., "pick up groceries friday + dinner sam 8pm sat")

```
User types into Kiwi Console (Client)
  ↓
POST /api/kiwi { message, history }
  ↓
Route handler (Node) validates session via @supabase/ssr
  ↓
buildContext(supabase, userId) — parallel fetches: projects, hashtags,
                                  recent tasks, gcal calendars, today's events
  ↓
streamText({ model: anthropic('claude-sonnet-4-6'), system, tools, messages })
  ↓
Sonnet 4.6 emits 2 tool_use blocks: create_task, create_event
  ↓
Stream tokens to client as they arrive (thinking-word UI plays during latency)
  ↓
onFinish: executeAction(create_task) → Postgres → Realtime echo to TasksBoard
          executeAction(create_event) → Google Calendar API
  ↓
Client receives final result; intent badges render with success/failure per action
```

### Page Load Flow (e.g., navigating to /tasks)

```
Browser navigates to /tasks
  ↓
middleware.ts refreshes Supabase session cookie if needed
  ↓
(app)/layout.tsx — server-side auth check via getUser()
  ↓
tasks/page.tsx (Server Component) — fetches initial tasks via createServerClient
  ↓
HTML streams to browser with hydrated initial state
  ↓
TasksBoard (Client Component) hydrates → mounts useTableSubscription
  ↓
Live deltas flow as other devices/Kiwi modify tasks
```

---

## 9. Suggested Build Order

This is the dependency order — what must exist before what.

### Layer 0 — Foundations (no app logic yet)
1. **Repo + tooling:** Next.js 15 App Router, TypeScript strict, Tailwind, Vitest, npm workspaces
2. **Supabase project:** Local dev via Supabase CLI; `supabase/migrations/` workflow
3. **Auth shell:** `middleware.ts`, `lib/supabase/{server,client,middleware}.ts`, Google OAuth, `(app)/layout.tsx` gate, `/auth` page
4. **Type generation:** `supabase gen types typescript` wired into build

### Layer 1 — Schema + raw CRUD (no agent yet)
5. **Migrations for all tables:** users, areas, projects, tasks, captures, hashtags, junction tables — with enums, indexes, RLS policies
6. **Server Actions per domain:** `actions/{areas,projects,tasks,captures,hashtags}.ts` — typed CRUD only, no UI
7. **Vitest tests** for Server Actions (RLS enforcement, M2M behavior)

### Layer 2 — Realtime infrastructure
8. `lib/realtime/use-table-subscription.ts` hook
9. **Smoke test:** Two browser windows, mutate in one, observe live update in the other

### Layer 3 — Manual UI (one domain at a time)
10. **AppShell:** sidebar tree (areas → projects), tabs nav
11. **Areas page** (simplest, used by everything else)
12. **Projects page** + project detail page (Notion-style)
13. **Tasks page** (kanban + list; depends on projects for linking)
14. **Captures page** (depends on hashtags + projects)
15. By end of Layer 3: full manual CRUD works end-to-end without Kiwi

### Layer 4 — Google Calendar
16. **OAuth flow** (`/api/gcal/auth`, `/api/gcal/callback`, encrypted token storage)
17. **Token refresh helper** (`getValidGcalToken`)
18. **Calendar tab** with full CRUD over gcal events

### Layer 5 — Kiwi (the payoff)
19. **`packages/kiwi-core` skeleton** — pure TypeScript package, no React
20. **Tool schemas** (`create_task`, `create_capture`, `create_event`)
21. **`buildContext`** — pulls projects/hashtags/calendars/recent items from Supabase
22. **`runAgent`** — Anthropic SDK with strict tool_use, returns stream + tool calls
23. **`executeAction`** — server-side action execution (writes to Supabase, calls gcal)
24. **`/api/kiwi` route handler** — wires `buildContext` → `streamText` → `executeAction`
25. **Kiwi Console UI** — textarea with `$project`/`#hashtag` autocomplete, streaming render, thinking-word indicator, intent badges
26. **Vitest tests** for the agent JSON contract (regression suite for prompt changes)

### Layer 6 — Polish
27. Error boundaries, toast notifications, loading states
28. Settings page (graduation year, gcal status, theme)
29. Manual mode toggle on Kiwi (force capture/task/event)
30. Aesthetic pass (EB Garamond/Louize, journal-paper styling, Warp-terminal feel)

**Why this order:**
- Schema before code: Lock data shape early; everything else depends on it
- Manual CRUD before Kiwi: Kiwi's `executeAction` calls the same primitives; building manual UI first proves the primitives work
- Realtime early: Catches subscription/echo bugs before they're entangled with feature complexity
- Gcal before Kiwi: So Kiwi can compose `create_event` from day one
- Kiwi last: Maximizes upstream debugging opportunities; the agent has everything it needs

---

## 10. Architectural Patterns

### Pattern 1: Server Component shell + Client island

**What:** Wrap interactive UI in a Client Component but feed initial data from a Server Component parent.
**When:** Any page that needs both fast first paint and realtime/interactivity (i.e., every authenticated page in this app).
**Trade-offs:** Two-component dance per page, but you get SSR perf + dynamic UX. Standard 2026 idiom.

### Pattern 2: Single mutation path (Server Actions reused by Kiwi)

**What:** Every domain has a `actions/<domain>.ts` Server Action file. Manual UI calls them from forms; Kiwi's `executeAction` calls the same functions internally.
**When:** Any time the agent and the UI can both create/modify the same entity.
**Trade-offs:** One source of mutation logic — simplifies validation, audit logs, side effects. The risk is coupling Kiwi to Next-specific code; mitigate by keeping the lowest-level helpers (`insertTask`, etc.) in `lib/supabase/` and importing both from there.

```typescript
// lib/supabase/queries/tasks.ts — pure helper
export async function insertTask(supabase, userId, input) { /* ... */ }

// app/actions/tasks.ts — Server Action wraps it
'use server';
export async function createTaskAction(input) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return insertTask(supabase, user.id, input);
}

// packages/kiwi-core/src/execute.ts — agent uses the same helper
import { insertTask } from '@hyperpolymath/web/lib/supabase/queries/tasks';
// (or duplicate the helper into kiwi-core to avoid the cross-import)
```

### Pattern 3: Optimistic UUID generation for realtime dedupe

**What:** Generate row IDs client-side, pass to server, dedupe realtime echoes by ID match.
**When:** Any optimistically-rendered insert in a realtime-subscribed list.
**Trade-offs:** Requires UUIDv4 support client-side (trivial) and `gen_random_uuid()` not used as the default (use `coalesce(:id, gen_random_uuid())` pattern in inserts).

### Pattern 4: Strict tool_use with one tool per action type

**What:** Define one Anthropic tool per Kiwi action (`create_task`, `create_capture`, `create_event`); model can emit multiple tool calls in one response.
**When:** Multi-action agent contract where each action has distinct args.
**Trade-offs:** Cleaner schemas than one mega-tool with discriminator; Anthropic's tool streaming gives natural intent-badge UX.

---

## 11. Anti-Patterns

### Anti-Pattern 1: Per-page auth checks

**What people do:** Repeat `useEffect(() => onAuthStateChanged(...))` in every page (v1 did this).
**Why it's wrong:** Forgettable, race-prone, redundant client work.
**Do this instead:** Single `(app)/layout.tsx` server-side gate + `middleware.ts` cookie refresh.

### Anti-Pattern 2: Direct Supabase calls from React components

**What people do:** Import `supabase` and call `.from(...)` inline in components for mutations.
**Why it's wrong:** Bypasses the centralized Server Action mutation path, harder to test, can't be reused by Kiwi.
**Do this instead:** Server Actions for mutations; `useTableSubscription` for live reads. Components stay declarative.

### Anti-Pattern 3: Storing calendar events in Postgres "for caching"

**What people do:** Mirror gcal events into a Postgres table to query offline / fast.
**Why it's wrong:** Dual-write consistency is hell. v1 explicitly rejected this; PROJECT.md flags it.
**Do this instead:** Fetch on page load. If perf becomes an issue, add a per-request memo, not durable storage.

### Anti-Pattern 4: Database-stored Kiwi prompt for "hot-swap"

**What people do:** Store the system prompt in a DB row and edit it via admin UI.
**Why it's wrong:** Single-user app doesn't need this; loses git history; no atomic deploy with code changes; tests can't pin a version.
**Do this instead:** Source-controlled prompt; deploy to ship changes.

### Anti-Pattern 5: Fighting realtime echoes with manual state diffs

**What people do:** Track "I just made this change" booleans to suppress the echoed update.
**Why it's wrong:** Brittle, race-condition prone, doesn't survive multi-tab.
**Do this instead:** ID-based dedupe (Pattern 3 above).

### Anti-Pattern 6: Edge runtime for the Kiwi route

**What people do:** Default to Edge for "AI" routes thinking it's faster.
**Why it's wrong:** Anthropic SDK + Supabase server client + token refresh fight Edge constraints; cold start is fine on Vercel for low volume.
**Do this instead:** Node runtime. Reconsider only if cold-start latency becomes user-visible.

### Anti-Pattern 7: Recursive RLS policies on junction tables

**What people do:** Write RLS that joins the parent table to check ownership.
**Why it's wrong:** Postgres detects recursion and errors at runtime; even when it works, performance suffers.
**Do this instead:** Denormalize `user_id` onto junction tables (as designed above).

---

## 12. Scaling Considerations

This is a single-user app. "Scaling" mostly means "doesn't get sluggish for Filippo across years of data."

| Scale | Adjustments |
|-------|-------------|
| 1 user × 1 year (~few thousand tasks/captures) | Default architecture; no changes needed |
| 1 user × 5+ years (~tens of thousands) | Add pagination/infinite-scroll on Captures feed; partial indexes on `archived_at is null` already help |
| Multi-user (future) | Zero schema changes; turn on signup, monitor RLS perf, add read replicas if Realtime overhead grows |

### Likely First Bottlenecks

1. **Captures feed grows unbounded.** Mitigation: cursor-based pagination from day one (`order by created_at desc limit 50` + cursor); the `captures_user_created_idx` is already in place.
2. **Kiwi context-build latency.** As project count grows, the parallel fetches still finish fast, but the system prompt grows. Mitigation: cap recent items at 10–20; only include active (non-archived) projects.
3. **Realtime channel count if many tabs open.** Per-table channels mean ~5 active subscriptions max on the heaviest page; well within Supabase free-tier limits.

---

## 13. Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic Sonnet 4.6 | `@anthropic-ai/sdk` via Vercel AI SDK `streamText`, server-side only | Strict tool_use mode; one tool per action type |
| Google Calendar | OAuth 2.0 (offline access for refresh token); REST API per request | Tokens encrypted with pgcrypto in `users` table; refresh transparently |
| Supabase Postgres | `@supabase/ssr` for SSR/Server Actions; `@supabase/supabase-js` for browser | Triple-client pattern (server / browser / middleware) |
| Supabase Realtime | Postgres changes channel per table, filtered by `user_id=eq.{id}` | Cleanup in useEffect return; ID-based dedupe |
| Supabase Auth | Google OAuth provider | `getUser()` server-side, `getSession()` browser-side only |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Web ↔ kiwi-core | Direct function call (server-side) | kiwi-core has no React/Next deps |
| Future CLI ↔ kiwi-core | Direct function call (Node CLI process) | Same surface; CLI passes its own Supabase client |
| Server Actions ↔ kiwi-core executor | Both call shared `lib/supabase/queries/*` helpers | Single mutation path; no logic duplication |
| Client ↔ Server Actions | RPC via Next.js binding | Type-safe; use `revalidatePath` after mutations to refresh Server Component data |
| Client ↔ /api/kiwi | SSE stream via `useChat` | Word-by-word streaming preserves v1 thinking-word UX |
| Client ↔ Supabase Realtime | WebSocket via `@supabase/supabase-js` | Lifecycle managed by `useTableSubscription` hook |

---

## 14. Coherent Whole: How Realtime + RLS + Agent Work Together

The three core constraints — realtime everywhere, RLS-scoped rows, and Kiwi as the unifying surface — interlock cleanly:

1. **RLS is the security boundary.** Every read/write through any client (browser, server, Kiwi) goes through Supabase, so policies enforce `user_id` ownership uniformly. No app-level auth checks per query.
2. **Realtime respects RLS.** Supabase Realtime applies the same policies — clients only receive deltas for rows they can read. The `filter=user_id=eq.{id}` is a wire optimization, not a security measure.
3. **Kiwi writes through the same primitives.** `executeAction` calls the same `lib/supabase/queries/*` helpers as the manual UI. Realtime echoes Kiwi's writes back to whichever tabs are open, just like it would for a manual mutation. No special agent path = no special bugs.
4. **Streaming + realtime = no awkward refresh.** The user types into Kiwi → words stream into the console → as `onFinish` executes the action, the Tasks page (in another tab or the sidebar) updates via realtime. No "click refresh to see your task" moment.

This is the coherent UX promise: **type a sentence, see the right things appear in the right places, instantly, everywhere.**

---

## Sources

- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Server Actions vs API Routes 2026 guidance](https://www.wisp.blog/blog/server-actions-vs-api-routes-in-nextjs-15-which-should-i-use)
- [Supabase Auth with Next.js App Router](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase Auth advanced guide (getUser vs getSession)](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase RLS Best Practices (junction tables, perf)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime)
- [Managing Supabase Realtime subscriptions](https://app.studyraid.com/en/read/8395/231602/managing-real-time-subscriptions)
- [Anthropic Structured Outputs (strict tool_use, Sonnet 4.5)](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic Strict Structured Outputs announcement](https://aiengineerguide.com/til/anthropic-claude-structured-outputs/)
- [Vercel AI SDK streamText with Anthropic](https://blog.logrocket.com/nextjs-vercel-ai-sdk-streaming/)
- [Building a Claude streaming agent with Vercel AI SDK 2026](https://jangwook.net/en/blog/en/vercel-ai-sdk-claude-streaming-agent-2026/)
- [Postgres Single Table vs Class Table Inheritance](https://medium.com/@artemkhrenov/table-inheritance-patterns-single-table-vs-class-table-vs-concrete-table-inheritance-1aec1d978de1)
- [Google OAuth refresh tokens with Supabase](https://www.nylas.com/blog/how-to-combine-supabase-google-auth-and-nylas-google-app-permissions-in-a-next-js-application/)
- v1 reference: `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/resources/HYPERPOLYMATH_V2_HANDOFF.md`

---
*Architecture research for: Personal life-OS web app with NLP agent (Hyperpolymath v2)*
*Researched: 2026-05-07*
