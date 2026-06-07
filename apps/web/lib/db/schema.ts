import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  bigint,
  primaryKey,
  check,
  index,
  uniqueIndex,
  jsonb,
  customType,
} from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { priorityEnum, taskStatusEnum, semesterTermEnum } from "./enums";

// tsvector type for Postgres full-text search (used on captures.content_search).
// Pattern 7 from 02-RESEARCH.md.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// bytea type for Postgres binary columns (used on users.gcal_*_token_encrypted).
// Phase 4 Plan 04-01 (D-05): app-level AES-256-GCM ciphertext is stored as bytea —
// `iv (12B) || tag (16B) || ciphertext`. Drizzle ships `bytea` as a `Buffer` on the
// postgres-js driver (driverData == data == Buffer).
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// users — mirrors auth.users for app-side metadata. Trigger (migration 0002) keeps in sync.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull(), // references auth.users(id) — ref added in raw SQL migration
  email: text("email").notNull(),
  graduationYear: integer("graduation_year"), // nullable until onboarding completes (D-11)
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }), // null = needs onboarding (D-11)
  // Phase 4 Plan 04-04 cutover: Phase 1 placeholder plain-text columns
  // (gcal_refresh_token, gcal_access_token) were DROPPED by migration 0008
  // after the encrypted columns below became the sole source of truth.
  // Only gcal_token_expires_at remains as plain timestamptz (non-sensitive
  // metadata; see RESEARCH §Pattern 3 footnote).
  gcalTokenExpiresAt: timestamp("gcal_token_expires_at", { withTimezone: true }),
  // Phase 4 Plan 04-01 (D-05 app-level AES-256-GCM, D-08 timezone, D-09 default
  // calendar, D-10 multi-calendar visibility). See migration 0007.
  gcalRefreshTokenEncrypted: bytea("gcal_refresh_token_encrypted"),
  gcalAccessTokenEncrypted: bytea("gcal_access_token_encrypted"),
  gcalDefaultCalendarId: text("gcal_default_calendar_id"),
  gcalVisibleCalendarIds: text("gcal_visible_calendar_ids").array(),
  timezone: text("timezone"), // IANA, e.g., "America/New_York" (D-08)
  // Reserved for Phase 6 (theme).
  theme: text("theme").default("light"),
  // Profile — user-editable on /settings. avatar_url stores the public URL
  // of the uploaded avatar in the `avatars` Supabase Storage bucket. The
  // Google-OAuth-supplied picture on auth.users.user_metadata remains the
  // fallback when avatar_url is null.
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Phase 11 / CACHE-03 (D-01) — tamper-proof freshness counter bumped by
  // Postgres BEFORE-triggers on tasks/captures/projects/areas/habits/jarvis_facts
  // (migration 0019). Read once per JARVIS turn at the route boundary; used as
  // the in-memory snapshot cache key by lib/jarvis/state-snapshot-cache.ts.
  stateVersion: bigint("state_version", { mode: "bigint" })
    .notNull()
    .default(1n),
});

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

    // Class fields (D-04): nullable, but CHECK constraint enforces course_code NOT NULL when is_class
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
    // D-04: when is_class=true, course_code must NOT be null. Other class fields stay optional.
    check(
      "class_fields_consistent",
      sql`(${t.isClass} = false) OR (${t.isClass} = true AND ${t.courseCode} IS NOT NULL)`,
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    priority: priorityEnum("priority").notNull().default("P3"),
    status: taskStatusEnum("status").notNull().default("not started"),
    dueDate: date("due_date"),
    kanbanPosition: integer("kanban_position").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_user_due_idx").on(t.userId, t.dueDate).where(sql`due_date IS NOT NULL`),
  ],
);

export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // D-14 (Phase 5 Plan 05-02): additive column tagging origin of the
    // capture. JARVIS-created captures write 'jarvis'; manual captures stay
    // NULL. Plan 05-04 keys the "Convert to task" affordance off this.
    createdVia: text("created_via"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // CAPT-06: full-text search column (generated; backed by raw-SQL migration 0005).
    // Drizzle 0.36 does not reliably emit GENERATED ALWAYS AS clauses for customType, so the
    // migration is hand-written (see drizzle/0003_captures_search.sql and
    // supabase/migrations/0005_captures_search.sql). Listing the column here gives type-safe
    // query access (sql template references compile, no runtime cast needed).
    contentSearch: tsvector("content_search").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', content)`,
    ),
  },
  (t) => [
    index("captures_user_created_desc_idx").on(t.userId, sql`created_at DESC`),
    index("captures_content_search_gin_idx").using("gin", t.contentSearch),
  ],
);

export const hashtags = pgTable(
  "hashtags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // lowercase canonical (CAPT-08)
    displayName: text("display_name").notNull(), // first-seen casing for UI
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("hashtags_user_name_uniq").on(t.userId, t.name)],
);

// Junction tables — denormalize user_id (D-03 + ARCHITECTURE.md §3 + Pitfall RLS-recursion)
export const tasksProjects = pgTable("tasks_projects", {
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized; Server Actions enforce match with parent
}, (t) => [
  primaryKey({ columns: [t.taskId, t.projectId] }),
  index("tasks_projects_project_idx").on(t.projectId),
  index("tasks_projects_user_idx").on(t.userId),
]);

export const capturesProjects = pgTable("captures_projects", {
  captureId: uuid("capture_id")
    .notNull()
    .references(() => captures.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.captureId, t.projectId] }),
  index("captures_projects_project_idx").on(t.projectId),
  index("captures_projects_user_idx").on(t.userId),
]);

export const capturesHashtags = pgTable("captures_hashtags", {
  captureId: uuid("capture_id")
    .notNull()
    .references(() => captures.id, { onDelete: "cascade" }),
  hashtagId: uuid("hashtag_id")
    .notNull()
    .references(() => hashtags.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.captureId, t.hashtagId] }),
  index("captures_hashtags_hashtag_idx").on(t.hashtagId),
  index("captures_hashtags_user_idx").on(t.userId),
]);

// kiwi_events — telemetry table ships now per D-01 (Phase 5 reads/writes; Phase 1 just creates the shell)
export const kiwiEvents = pgTable(
  "kiwi_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turnAt: timestamp("turn_at", { withTimezone: true }).defaultNow().notNull(),
    actionTypes: text("action_types").array(), // e.g., ['create_task','create_event']
    latencyMs: integer("latency_ms"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorCode: text("error_code"),
    metadata: jsonb("metadata"), // free-form for future fields without migrations
  },
  (t) => [index("kiwi_events_user_turn_idx").on(t.userId, sql`turn_at DESC`)],
);

// jarvis_facts — Phase 5.1 Plan 05.1-03 (D-M1 / JARVIS-18). Persistent memory.
// Stores one row per user-fact for whole-blob injection into the cached system
// prompt (D-M4). UNIQUE(user_id, type, key) enforces last-write-wins via
// onConflictDoUpdate. Hard-delete on forgetFactAction (no deleted_at column).
export const jarvisFacts = pgTable(
  "jarvis_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    // CHECK constraints + UNIQUE enforced in raw SQL (migration 0011).
    // Drizzle index name suffixed _drz to avoid collision with the SQL-defined index.
    index("jarvis_facts_user_type_idx_drz").on(t.userId, t.type),
  ],
);

// jarvis_events — Phase 5 Plan 05-02 (RES-05). One row per JARVIS turn.
// Mirrors the kiwi_events shell but with the canonical JARVIS column set:
// usage tokens (input/output/cache_read/cache_creation), first-token latency,
// voice_active boolean (Phase 7 forward-compat), slash_command_mode, and the
// pre_parsed_dates jsonb the client computed via chrono-node.
// RLS: owner-only SELECT + INSERT (migration 0009). No UPDATE/DELETE policies.
/**
 * jarvis_turns — persisted scrollback for the JARVIS Console.
 *
 * Stores every user + assistant turn so the UI can hydrate full conversation
 * history on page reload. The LLM context window still uses an in-memory
 * sliding window of the last N turns (see JarvisConsole `buildHistory`) — we
 * persist for DISPLAY, not for prompt input.
 *
 * Columns are a flat projection of the client-side `ScrollbackTurn` union:
 *   - `kind` discriminates user vs assistant
 *   - `text` / `text_delta` are populated per kind
 *   - `actions` + `clarification` are JSONB blobs that mirror the client shapes
 *   - `status` + `error_message` are assistant-only
 *
 * RLS: owner-only SELECT + INSERT + UPDATE (added in the migration). UPDATE
 * is needed so undo + streaming-finalize can amend an existing assistant
 * turn by id (upsert pattern from the client).
 */
export const jarvisTurns = pgTable(
  "jarvis_turns",
  {
    id: uuid("id").primaryKey(), // client-generated UUID (so save-on-stream-end finds the row)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'user' | 'assistant'
    text: text("text"), // user turn body; null for assistant
    textDelta: text("text_delta"), // assistant prose; null for user
    actions: jsonb("actions").notNull().default(sql`'[]'::jsonb`),
    clarification: jsonb("clarification"),
    status: text("status"), // 'streaming' | 'done' | 'error' for assistant; null for user
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("jarvis_turns_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const jarvisEvents = pgTable(
  "jarvis_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    promptText: text("prompt_text").notNull(),
    preParsedDates: jsonb("pre_parsed_dates"),
    slashCommandMode: text("slash_command_mode"),
    voiceActive: boolean("voice_active").notNull().default(false),
    actionTypes: text("action_types").array(),
    cacheReadInputTokens: integer("cache_read_input_tokens"),
    cacheCreationInputTokens: integer("cache_creation_input_tokens"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    firstTokenMs: integer("first_token_ms"),
    error: text("error"),
    // Phase 9 / TEL-01 — per-stage timestamps. Nullable; populated at
    // their natural capture sites (see migration 0017 header). LLM-stage
    // columns (promptBuiltAt/firstTokenAt/lastTokenAt/toolLoopDoneAt)
    // populate on every turn; voice-pipeline columns (vadEndAt/sttDoneAt/
    // ttsFirstByteAt/audioFirstPlayAt) populate only when voiceActive=true.
    vadEndAt: timestamp("vad_end_at", { withTimezone: true }),
    sttDoneAt: timestamp("stt_done_at", { withTimezone: true }),
    promptBuiltAt: timestamp("prompt_built_at", { withTimezone: true }),
    firstTokenAt: timestamp("first_token_at", { withTimezone: true }),
    lastTokenAt: timestamp("last_token_at", { withTimezone: true }),
    toolLoopDoneAt: timestamp("tool_loop_done_at", { withTimezone: true }),
    ttsFirstByteAt: timestamp("tts_first_byte_at", { withTimezone: true }),
    audioFirstPlayAt: timestamp("audio_first_play_at", { withTimezone: true }),
  },
  (t) => [index("jarvis_events_user_created_idx").on(t.userId, sql`created_at DESC`)],
);

// ---------------------------------------------------------------------------
// waitlist — Phase 8 (D-12 / LAND-WAITLIST). Anonymous email capture from the
// public landing manifesto. FIRST table to break the userId-scoped RLS pattern.
//
// Security model (load-bearing — see 08-RESEARCH.md §Pitfall 5):
//   - Drizzle pooler connection uses the DB-owner role → BYPASSES RLS.
//   - Real security boundary is `apps/web/app/actions/waitlist.ts` (Zod +
//     honeypot + IP rate limit + ON CONFLICT DO NOTHING).
//   - RLS policies in supabase/migrations/0012_waitlist.sql are defense-in-depth
//     ONLY for the unlikely case someone calls this table via supabase-js from
//     the browser. They do NOT protect Server Action writes.
//
// Reads: NO SELECT policy → admin reads happen via psql/Studio with service role.
// No userId column — signups are unauthenticated.
// ---------------------------------------------------------------------------
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    note: text("note"),
    // Hashed IP (sha256 first 16 chars) — written by Server Action for abuse triage.
    // Never raw IP per privacy posture.
    submittedIp: text("submitted_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("waitlist_email_uniq").on(t.email)],
);

// ─── HABITS ────────────────────────────────────────────────────────────────
// Same hierarchy tier as projects: live under areas, but M:N (a habit can
// belong to multiple areas). Frequency is a 7-bool array indexed Sun→Sat
// matching JS Date.getDay(). See supabase/migrations/0015_habits.sql for RLS.

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    daysOfWeek: boolean("days_of_week").array().notNull().default([true, true, true, true, true, true, true]),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("habits_user_idx").on(t.userId, t.orderIndex),
  ],
);

export const habitsAreas = pgTable(
  "habits_areas",
  {
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.habitId, t.areaId] }),
    index("habits_areas_area_idx").on(t.areaId),
    index("habits_areas_user_idx").on(t.userId),
  ],
);

// integration_tokens — third-party OAuth tokens (Strava, etc.) that rotate
// across exchanges. Composite PK (user_id, provider) gives one row per user
// per provider. Required because `strava-v3` does NOT auto-persist rotated
// refresh_tokens; we own the write (see 260607-h2k plan D-03).
// Single-user MVP — RLS deferred; column-level user_id is the boundary.
export const integrationTokens = pgTable(
  "integration_tokens",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
  ],
);

// flow_sessions — Pomodoro sessions imported from Flow app CSV exports.
// Unique on (user_id, started_at) so re-uploading the same CSV is a no-op
// upsert (existing rows update completed_at + duration; new rows insert).
export const flowSessions = pgTable(
  "flow_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("flow_sessions_user_started_uniq").on(t.userId, t.startedAt),
    index("flow_sessions_user_started_idx").on(t.userId, t.startedAt),
  ],
);

export const habitCompletions = pgTable(
  "habit_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    completedDate: date("completed_date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
    // 'in_progress' | 'almost_done' | 'done'. Row absence = not started.
    // CHECK constraint enforced in migration 0016.
    status: text("status").notNull().default("done"),
  },
  (t) => [
    uniqueIndex("habit_completions_habit_date_uniq").on(t.habitId, t.completedDate),
    index("habit_completions_user_date_idx").on(t.userId, t.completedDate),
  ],
);
