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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { priorityEnum, taskStatusEnum, semesterTermEnum } from "./enums";

// users — mirrors auth.users for app-side metadata. Trigger (migration 0002) keeps in sync.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull(), // references auth.users(id) — ref added in raw SQL migration
  email: text("email").notNull(),
  graduationYear: integer("graduation_year"), // nullable until onboarding completes (D-11)
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }), // null = needs onboarding (D-11)
  // Reserved for Phase 4 (gcal). Columns ship now per CONTEXT.md "out of scope".
  gcalRefreshToken: text("gcal_refresh_token"),
  gcalAccessToken: text("gcal_access_token"),
  gcalTokenExpiresAt: timestamp("gcal_token_expires_at", { withTimezone: true }),
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
  },
  (t) => [index("captures_user_created_desc_idx").on(t.userId, sql`created_at DESC`)],
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
