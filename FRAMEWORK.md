# Hyperpolymath — A Framework for a Personal Polymath OS

> *"You don't have to choose between being a runner or a musician,*
> *a creator or a scholar. The Renaissance had it right."*

---

## What this is

⚜  This is the small spec behind [`hyperpolymath-v2`](https://github.com/filippo-fonseca/hyperpolymath-v2) — the file you read when you want to understand the shape of the system, not the product. It is distilled from one user (me, Filippo) running [v1](https://github.com/filippo-fonseca/polymath-web) in production for 18 months and rebuilding v2 on Postgres for another 6. Everything here is load-bearing in the live app and nothing here is aspirational.

It names **five primitives** — Areas, Projects, Captures, JARVIS, Calendar — and **one agent contract** between them. That is the entire framework. The rest of the codebase is the same five primitives wired through Next.js 16, Drizzle, Supabase, and the LLM of choice in the backend, plus the discipline of refusing to add a sixth primitive when one of the existing five could be sharpened instead.

The point of the document is to be forkable in spirit AND in code. Read it once, decide whether the shape fits how you actually live, and either clone the repo or carry the primitives into your own stack. There is no product to sell. The repo is the offering.

---

## Areas

⚜  An **Area** is a top-level life domain. Health. School. Music. Writing. The number of Areas a person has is small — typically four to seven — and they change on the order of years, not weeks. Areas exist to give Projects a place to sit and to give the sidebar a navigable tree. They do not own tasks directly; tasks belong to Projects (or float free).

**FOR:** stable life domains you would name if someone asked "what do you spend your time on?". The thing that survives a semester change or a job change.

**NOT FOR:** moods, themes, fleeting interests, project categories. If it has an end date, it is a Project. If it is a tag, it is a `#hashtag` on a Capture.

```ts
// apps/web/lib/db/schema.ts
export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("areas_user_active_idx").on(t.userId).where(sql`archived_at IS NULL`)],
);
```

**Real examples (mine):** Health, School, Music, Writing, Hyperpolymath itself.

**Pitfall.** The temptation is to make Areas granular ("Yale CS", "Yale Humanities", "Yale Social"). Resist. One Area called "School" with Project-level granularity is correct. The sidebar gets unreadable past seven Areas and the cognitive load of placing a Project starts to exceed the benefit of placing it cleanly.

---

## Projects

⚜  A **Project** is a bounded effort inside an Area. It has a name, optionally a start and end date, optionally a banner, and zero or more Tasks and Captures attached. A Project can also be flagged as a **Class** — the academic special case — which unlocks course metadata (course code, instructor, grade, semester) without forcing every Project to carry it.

**FOR:** anything you want to track as a single unit of effort. A class. A paper. A side app. A training block. A book you're reading. A trip you're planning.

**NOT FOR:** life domains (those are Areas), single action items (those are Tasks), and ideas you haven't decided to act on (those are Captures).

```ts
// apps/web/lib/db/schema.ts
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    bannerUrl: text("banner_url"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    // Class fields: nullable, but CHECK enforces course_code NOT NULL when is_class.
    isClass: boolean("is_class").notNull().default(false),
    courseCode: text("course_code"),
    courseTitle: text("course_title"),
    instructor: text("instructor"),
    grade: text("grade"),
    credits: integer("credits"),
    distributionals: text("distributionals").array(),
    semesterTerm: semesterTermEnum("semester_term"),
    semesterYear: integer("semester_year"),

    orderIndex: integer("order_index").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("projects_user_area_active_idx")
      .on(t.userId, t.areaId)
      .where(sql`archived_at IS NULL`),
    index("projects_user_class_idx").on(t.userId, t.isClass).where(sql`is_class = true`),
    check(
      "class_fields_consistent",
      sql`(${t.isClass} = false) OR (${t.isClass} = true AND ${t.courseCode} IS NOT NULL)`,
    ),
  ],
);
```

**Real examples (mine):** *ANTH 2480*, *MATH 230*, *finish the JARVIS console*, *marathon training Q3*, *Goethe rewrite*.

`endDate` is nullable on purpose — indefinite projects are first-class. A class ends; a writing project might not. `orderIndex` lets the sidebar respect user-driven order instead of always sorting by created-at, which matters once you have more than three Projects in an Area.

**Pitfall.** The Class flag is a CHECK constraint, not a separate table. Two design instincts will push you toward a `classes` table joined to `projects`; both are wrong for a single-user app. A class IS a project with extra columns. Splitting the table doubles the migration count and forces JARVIS to know which surface to write to.

---

## Captures

⚜  A **Capture** is a freeform note — the inbox. Captures exist because the gap between "I had an idea" and "I have time to file it" is where ideas die. Every Capture is full-text searchable via a generated `tsvector` column, can be tagged with one or more `#hashtags` (auto-created the first time you use them), and can be linked to one or more Projects via `$projectname` syntax.

**FOR:** anything you want to record without deciding what it is. An idea. A quote. A thought. A reminder to think about a thing later. The thing you'd write on the back of a receipt.

**NOT FOR:** action items with a clear deliverable (those are Tasks) or time-bound events (those are Calendar events). The agent applies the **capture-first principle** for ambiguity — but on the manual side, if you know it's a Task, make it a Task. The Captures feed will grow past 1,000 entries within a year of real use, and a Task hiding in it is a Task that won't get done.

```ts
// apps/web/lib/db/schema.ts
export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // D-14: additive column tagging origin. JARVIS-created captures write
    // 'jarvis'; manual captures stay NULL. Powers the "Convert to task"
    // affordance.
    createdVia: text("created_via"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // Generated tsvector for full-text search; backed by a hand-written SQL
    // migration because Drizzle 0.36 does not emit GENERATED ALWAYS AS for
    // customType reliably.
    contentSearch: tsvector("content_search").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', content)`,
    ),
  },
  (t) => [
    index("captures_user_created_desc_idx").on(t.userId, sql`created_at DESC`),
    index("captures_content_search_gin_idx").using("gin", t.contentSearch),
  ],
);
```

**Hashtag normalization.** Hashtags store both a lowercase canonical `name` and a `displayName` keyed to the first-seen casing. `#Idea` and `#idea` collapse to the same hashtag row; the UI shows whichever casing you used first. This avoids the classic "I have 14 variations of `#book`" problem.

```ts
export const hashtags = pgTable(
  "hashtags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),         // lowercase canonical
    displayName: text("display_name").notNull(), // first-seen casing
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("hashtags_user_name_uniq").on(t.userId, t.name)],
);
```

**Real examples (mine):** `#idea polymathy as a competitive advantage`, `great energy in the lab group today. so much momentum`, `revisit the gardner essay on focus`.

**Pitfall.** Captures want a junction table for hashtags and another for projects (`captures_hashtags`, `captures_projects`). Both denormalize `userId` onto the junction row — without that denormalization, Row-Level Security recurses and the policy can never be satisfied in a single query. The pattern shows up identically for tasks (`tasks_projects`). Bake it in from day one.

---

## JARVIS

⚜  **JARVIS** is the agent contract. One sentence in, N typed JSON actions out. It is named after a fictional butler because the personality matches (British register, formal, concise, dry, never sycophantic) and because the name carries no product baggage. The contract is what makes the rest of the framework cohere.

The contract has five tools, total. These are the only ways JARVIS can affect the system. Adding a sixth is a load-bearing decision; the current five have been stable across two phases.

```ts
// packages/jarvis-core/src/tools/index.ts
// (abbreviated — see source for full strict-mode JSON schemas)

create_task          // action items with a clear deliverable
create_capture       // freeform note — the default fallback
create_event         // Google Calendar event with a start + end
remember_fact        // persistent cross-session memory
ask_clarification    // single clarifying question instead of acting
```

**Strict Tool Use.** Every action is a schema-validated JSON tool call. The Zod schema is the source of truth; the model cannot emit a malformed action. One input becomes N actions, each a different shape. The model's tool-emission is bound by a per-tool `strict: true` flag and the input schemas are derived from Zod via `z.toJSONSchema()`. There is no "free-text output that we then parse." There is no second pass.

```ts
// What goes over the wire (abbreviated):
{
  type: "tool_use",
  name: "create_event",
  input: {
    title: "Coffee with Sam",
    start: "2026-05-30T20:00:00-04:00",
    end:   "2026-05-30T21:00:00-04:00",
  },
}
```

**Capture-first.** If JARVIS cannot tell whether something is a Task, a Capture, or a Calendar event, it creates a Capture. It does not ask. Asking is the worst outcome — the user typed one sentence to get a result, not to start a conversation — so `ask_clarification` is reserved for the narrow case where capture-first would lose clearly-intended specific information AND a referent is unambiguously ambiguous (typically a `$project` collision).

**Deterministic date pre-parser.** Before the model sees the user's sentence, a server-side pass with `chrono-node` extracts candidate dates and time ranges with full IANA-timezone awareness. The output is injected into the prompt as a `[SYSTEM-PARSED DATES]` hint. The model still gets to disagree, but it almost never does, and the gain is that "8pm saturday" deterministically becomes the next Saturday at 20:00 in the user's timezone — no LLM creativity required.

**Prompt caching architecture.** The system prompt is large (tool definitions, voice, memory, examples). It would be wasteful to send it every turn. Anthropic's prompt-cache `cache_control: { type: "ephemeral" }` is attached to the LAST tool in the tools array, which marks a cache breakpoint for everything above it. Verified live: cold turn writes ~2,400 cache_creation tokens; subsequent turns within 5 minutes read ~2,400 cache_read tokens at a tenth of the cost.

**Voice register.** British, formal, concise, dry. "Done." beats a chirpy "I've successfully scheduled that for you, no problem at all." "Noted." beats "Got it, I've saved that capture for later, nice one." Sycophancy is contraindicated. This is encoded both in the system prompt and in the receipts the UI shows after each action.

---

## Calendar

⚜  Google Calendar is the **source of truth** for everything time-bound. JARVIS does not mirror events into Postgres. The app is a CRUD operator on top of `gcal` — it reads and writes through the Google Calendar API on every page load, with no local cache that could drift.

```
   user
     │
     ▼
   ┌───────────────────┐         ┌───────────────────┐
   │  apps/web         │ ──────► │  Google Calendar  │
   │  lib/gcal/*       │ ◄────── │  (source of truth)│
   └───────────────────┘         └───────────────────┘
```

This decision rules out a whole category of bugs (dual-write inconsistency, sync loops, "why is the event in two places") and it costs us almost nothing — Calendar v3 is fast, and `refetchOnWindowFocus: true` covers external edits. The trade is that offline-write is unsupported. For a personal life-OS with one user, that trade is correct.

**OAuth tokens are encrypted at rest.** Refresh tokens cannot live as plaintext in Postgres; an exposed database backup would be an open API key for every user's calendar. The app stores both the refresh and access tokens in `bytea` columns using app-level AES-256-GCM (`iv || tag || ciphertext`), with the key in an environment variable that never touches the database. `pgcrypto` was the alternative; `pgcrypto` requires per-call key plumbing and is harder to reason about than AES-GCM at the application boundary.

```ts
// apps/web/lib/db/schema.ts (excerpt)
gcalRefreshTokenEncrypted: bytea("gcal_refresh_token_encrypted"),
gcalAccessTokenEncrypted:  bytea("gcal_access_token_encrypted"),
gcalTokenExpiresAt:        timestamp("gcal_token_expires_at", { withTimezone: true }),
gcalDefaultCalendarId:     text("gcal_default_calendar_id"),
gcalVisibleCalendarIds:    text("gcal_visible_calendar_ids").array(),
timezone:                  text("timezone"), // IANA, e.g., "America/New_York"
```

**The one boundary.** `apps/web/lib/gcal/*` is the single place that imports `googleapis`. Domain code never touches the SDK directly. This keeps token-refresh, error handling, and retry logic in one file and lets the rest of the codebase treat the calendar as a typed Promise-returning module.

---

## The Data Model

⚜  Here is the whole system in one ASCII frame — lifted verbatim from the repo README, because the README is the canonical voice and a diagram should not be re-drawn from memory:

```
                                  ┌──────────────────────────────┐
                                  │   JARVIS  ·  Claude 4.6      │
                                  │   strict tool use · stream   │
                                  └──────────────┬───────────────┘
                                                 │ structured JSON
                                                 ▼
   ┌──────────────────────┐         ┌─────────────────────────────┐         ┌─────────────────────┐
   │   Next.js 16 (RSC)   │ ──────► │   Server Actions / API      │ ──────► │  Drizzle  ·  pg     │
   │   Tailwind 4 · React │ ◄────── │   Zod validation · executor │ ◄────── │  Supabase Postgres  │
   │   shadcn · Motion 12 │         └──────────────┬──────────────┘         └──────────┬──────────┘
   └──────────┬───────────┘                        │                                    │
              │                                    │ Realtime ch                        │ RLS · userId
              │ TanStack Query                     ▼                                    │
              │ invalidate on event ◄──── Supabase Realtime ────────────────────────────┘
              │
              └──────────────────────────────────────► Google Calendar  (source of truth · gcal CRUD)
```

The load-bearing decisions, in plain English:

| Decision | Why |
|---|---|
| **gcal is the source of truth for scheduling, never mirrored in Postgres** | Eliminates dual-write consistency bugs. The app is a CRUD operator over Google Calendar, not a competing store. |
| **`userId` scoping + Row-Level Security from day one** | Single-user architecturally, multi-user-ready by construction. Adding a second user is a sign-up flow, not a schema migration. |
| **Drizzle ORM for typed queries · `supabase-js` for Auth / Realtime / Storage** | Drizzle is what `supabase-js` is bad at (typed queries from schema as source of truth). `supabase-js` is what Drizzle does not do (sockets, OAuth, files). Both, used for their strengths, beats either alone. |
| **TanStack Query as the read cache · Supabase Realtime fires invalidations** | Realtime payload comes in → invalidate the query key → refetch. Simpler than merging payloads into cache, and it gives free request dedup, optimism, devtools. |
| **Direct `@anthropic-ai/sdk` (no Vercel AI SDK abstraction)** | Single provider, heavy tool use, custom streaming UX (the thinking-word indicator). One less layer, more control. |
| **`getClaims()` over `getSession()` on the server** | `getClaims()` JWT-validates against published public keys. `getSession()` reads cookies without revalidation and is documented as spoofable. |

---

## How to Fork

⚜  The fork story is the same as the runbook. If you can clone the repo and get the dev server up, you have already adapted 90% of the framework. The remaining 10% is editing the primitives to match how you actually live.

**1. Clone and install.**

```bash
git clone https://github.com/filippo-fonseca/hyperpolymath-v2.git
cd hyperpolymath-v2
pnpm install
```

You will need Node 20.9+, pnpm 9.12+, a Supabase project (free tier is fine), and an Anthropic API key. Optionally a GitHub personal access token if you want the landing's build-log section to read past the 60/hr unauthenticated rate limit.

**2. Wire the environment.**

```bash
cp .env.example .env.local
```

The required keys are:

```
ANTHROPIC_API_KEY=                  # for JARVIS
NEXT_PUBLIC_SUPABASE_URL=           # Supabase project settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                       # Supabase pooler (port 6543, prepare: false)
GOOGLE_CLIENT_ID=                   # Google Cloud → APIs → OAuth client
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=                # http://localhost:3000/api/google-calendar/callback
GCAL_TOKEN_ENCRYPTION_KEY=          # 32-byte hex string, generated locally, never committed

# optional
GITHUB_TOKEN=                       # raises landing build-log rate limit from 60 → 5,000/hr
```

**3. Run migrations.**

```bash
pnpm db:migrate
```

This applies the Drizzle migrations to your Supabase Postgres, including the RLS policies that scope every row to the authenticated user.

**4. Boot.**

```bash
pnpm dev          # → http://localhost:3000
```

Sign in with Google. You will land on `/today` with no Areas, no Projects, no Captures, no Calendar connected. That is the empty state.

**5. What to change first.**

The primitives live in two places. Edit both:

- `apps/web/lib/db/schema.ts` — if you want a sixth primitive, add it here and add the corresponding RLS migration. Mostly you will not want a sixth primitive; mostly you will want to extend the columns of an existing one.
- `apps/web/app/(app)/` — each route maps roughly one-to-one to a primitive. Customize the views, change the copy, swap the iconography. The route group is intentional — it keeps logged-out surfaces (this landing, sign-in) free of the in-app chrome.

If you build something interesting on top of the framework, open an issue. I read them.

---

## What I Learned

⚜  The single biggest mistake from v1 was building Firebase-first. Firestore is fine for the first six months of a project; it is exhausting after the first year. The lack of relational integrity, the difficulty of joins, the lock-in around `onSnapshot`, and the impossibility of running real migrations all compound. v2 is on Postgres because the second time around I knew what to look for. If you are picking a backend for a multi-domain personal app, pick Postgres. The path of least regret is the path of most relational guarantees.

The single biggest insight from v2 was that **the agent contract is what makes the UX coherent**. Before JARVIS, the app was four tabs that did not really know about each other. After JARVIS, the four tabs were the typed JSON shapes of a single sentence parsed in one place. Every product decision downstream became simpler — what does the receipt look like, how does undo work, what is the keyboard shortcut — because the contract decided what was possible. The agent is not a feature; the agent is the shape of the system.

The third lesson is smaller but worth saying: **prompt caching is not optional**. Without `cache_control` on the last tool, every JARVIS turn re-sends the entire tool schema, the voice, the memory, and the examples. With it, you pay full cost on the first turn of a session and a tenth of the cost thereafter. The difference between a $30/month side project and a $3/month side project is one line of code.

Open source is a commitment, not a convenience. The repo is public because keeping it public forces every shortcut to be visible and every regret to be a teaching artifact. It is not because anyone is asking. If you fork the framework, please tell me what you changed and why — that is the only currency that matters.

---

## License & Attribution

MIT. See [`LICENSE`](./LICENSE). Open source by commitment, not convenience.

Hyperpolymath is built and maintained by [@filippo-fonseca](https://github.com/filippo-fonseca). The name, the wordmark, and the Renaissance trade-dress are part of an evolving personal brand; please don't reuse them for derivative products without asking.

**Acknowledgments.**

- **Andrej Karpathy**, for [nanoGPT](https://github.com/karpathy/nanoGPT) — both the model of "the README IS the landing page" and the discipline of "small is a feature." This document is shaped by both.
- Model providers that ship **Strict Tool Use** (or equivalent structured tool calling) as a first-class API instead of an afterthought. The agent contract is downstream of that discipline, not of any one vendor.

```
       ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜    ⚜
```

*be goated. well.*
