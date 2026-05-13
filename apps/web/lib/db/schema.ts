import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
