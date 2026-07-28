import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  bigint,
  numeric,
  primaryKey,
  check,
  index,
  unique,
  uniqueIndex,
  jsonb,
  vector,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import {
  priorityEnum,
  taskStatusEnum,
  semesterTermEnum,
  pageFieldTypeEnum,
  pageFieldScopeEnum,
} from "./enums";
// DevRunItem is single-sourced in the query helper; imported type-only here so
// the kiwi_dev_runs items jsonb column is typed without duplicating the shape.
import type { DevRunItem } from "./queries/dev-runs";
// Issue #221 — providerData jsonb shape, single-sourced in the link-preview lib.
import type { LinkPreviewProviderData } from "../link-preview/types";
// Issue #144 — recurring-task rule shape, single-sourced in lib/tasks/recurrence.
import type { RecurrenceRule } from "@/lib/tasks/recurrence";
// JARVIS routines — spec shape single-sourced in jarvis-core; imported type-only
// so the routines.spec jsonb column is typed without duplicating the contract.
import type { RoutineSpec } from "@hyperpolymath/jarvis-core/routines";
// Briefing — per-item meta shape single-sourced in lib/briefing/types; imported
// type-only so the briefing_items.meta jsonb column is typed without duplication.
import type { BriefingItemMeta } from "@/lib/briefing/types";

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
  // GitHub handle (no @, just the username) for the Life-tab contributions
  // heatmap and any future GitHub-backed surface. Null = not connected; the
  // heatmap renders a "connect in settings" placeholder. User-editable from
  // /settings and from the onboarding flow.
  githubUsername: text("github_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Phase 11 / CACHE-03 (D-01) — tamper-proof freshness counter bumped by
  // Postgres BEFORE-triggers on tasks/captures/projects/areas/habits/jarvis_facts
  // (migration 0019). Read once per JARVIS turn at the route boundary; used as
  // the in-memory snapshot cache key by lib/jarvis/state-snapshot-cache.ts.
  stateVersion: bigint("state_version", { mode: "bigint" })
    .notNull()
    .default(1n),
  // Phase 15 / TRN-14 (D-10) — user's preferred display unit for training
  // distances. Canonical storage is km on training_activities; the display
  // layer (lib/training/distance.ts in later plans) converts at the IO
  // boundary. CHECK constraint enforced in migration 0022.
  distanceUnit: text("distance_unit").notNull().default("km"),
  // Issue #142 — daily Pages (Wiki) backup to Google Drive. Per-user opt-out +
  // last-run telemetry for the /settings backup section. See migration 0044.
  //   pagesBackupEnabled  — when false, the daily cron skips this user (manual
  //                         "Back up now" still works regardless of the flag).
  //   pagesBackupLastRunAt — timestamp of the last attempt (success OR failure).
  //   pagesBackupLastStatus — short machine-readable status of that attempt:
  //                         "ok" | "skipped_empty" | "not_connected" |
  //                         "needs_drive_scope" | "error".
  //   pagesBackupLastError — human-readable detail when the last attempt failed
  //                         (null on success). Surfaced in the settings UI.
  pagesBackupEnabled: boolean("pages_backup_enabled").notNull().default(true),
  pagesBackupLastRunAt: timestamp("pages_backup_last_run_at", {
    withTimezone: true,
  }),
  pagesBackupLastStatus: text("pages_backup_last_status"),
  pagesBackupLastError: text("pages_backup_last_error"),
  // Issue #352 — JARVIS over text message (Twilio SMS/MMS). Per-user gate on
  // the whole inbound channel plus last-reply telemetry for /settings#messaging.
  // See migration 0039.
  //   smsJarvisEnabled     — DEFAULT FALSE, deliberately. An assistant that
  //                          starts auto-replying to text messages the moment
  //                          the code ships is the bad failure mode, so the
  //                          channel stays dark until it is switched on. The
  //                          webhook checks this BEFORE spending a turn, so an
  //                          inbound message costs zero Anthropic calls while
  //                          the flag is off.
  //   smsJarvisLastReplyAt — timestamp of the last inbound handled (success OR
  //                          failure).
  //   smsJarvisLastStatus  — short machine-readable status of that attempt:
  //                          "done" | "disabled" | "ignored_sender" | "error".
  //   smsJarvisLastError   — human-readable detail when it failed (null on
  //                          success). Surfaced in the settings UI.
  smsJarvisEnabled: boolean("sms_jarvis_enabled").notNull().default(false),
  smsJarvisLastReplyAt: timestamp("sms_jarvis_last_reply_at", {
    withTimezone: true,
  }),
  smsJarvisLastStatus: text("sms_jarvis_last_status"),
  smsJarvisLastError: text("sms_jarvis_last_error"),
});

// BYOK — per-user third-party API keys (Anthropic / Groq / ElevenLabs), stored
// as AES-256-GCM ciphertext (lib/crypto/byok.ts) so the owner never bills their
// own accounts for public users' usage. `last4` is a non-sensitive fingerprint
// for the Settings UI; the plaintext key never touches the DB. One row per
// (user, provider). RLS is owner-scoped in migration 0039.
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "anthropic" | "anthropic_admin" | "groq" | "elevenlabs"
    keyEncrypted: bytea("key_encrypted").notNull(),
    last4: text("last4").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

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
    // Issue #144 — Recurring TASKS (DISTINCT from Habits). NULL = one-off task.
    // Non-null = a recurring series whose single live row advances its due_date
    // to the next occurrence on completion/skip. Shape is RecurrenceRule from
    // lib/tasks/recurrence.ts: { frequency, interval, weekdays? }. Migration 0040.
    recurrence: jsonb("recurrence").$type<RecurrenceRule>(),
    // Linked-people derivation marker. NULL = the task's title/notes have never
    // been scanned for references to known people; non-null = already derived
    // (set by lib/people/derive.ts). Guards the lazy view-time backfill so the
    // Haiku smart-match runs at most once per task. Additive, migration 0029.
    peopleDerivedAt: timestamp("people_derived_at", { withTimezone: true }),
    // Issue #101 — Notion-style "URL" property. Optional canonical link the user
    // attaches to the task (normalized to include a scheme client-side; NULL =
    // unset). Rendered as a clickable link in the detail panel. Migration 0042.
    url: text("url"),
    // Phase 999.12 / CTX-04 — privacy gate for the MCP export. When true, this
    // task is filtered out of the personal-context snapshot. Migration 0027.
    noExport: boolean("no_export").notNull().default(false),
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
    // Capture provenance (migration 0028): the paired-device token's NAME
    // denormalized at insert time ('Web' for browser) so the record survives
    // token deletion, plus the input modality ('voice' | 'text').
    sourceDevice: text("source_device"),
    sourceInput: text("source_input"),
    // Issue #220 — first-class source channel for non-UI ingestion surfaces
    // such as AgentMail. Kept separate from sourceInput so "email" does not
    // render as a typed browser capture.
    sourceChannel: text("source_channel"),
    // Issue #101 — Notion-style "URL" property. Optional canonical link the user
    // attaches to the capture (normalized to include a scheme client-side; NULL =
    // unset). Rendered as a clickable link in the detail panel. Migration 0042.
    // Kept as the primary/canonical link for backward-compatible single-link
    // reads (feed, MCP export); mirrors urls[0].
    url: text("url"),
    // Multi-URL property (migration 0028 / 0045). The full ordered, de-duped set
    // of links attached to the capture — manual entries plus any auto-derived
    // from the body. Derivation only ever ADDS links (never removes/overwrites),
    // so any link present in the content stays indexed here. Empty '{}' = none.
    urls: text("urls").array().notNull().default([]),
    // Phase 999.12 / CTX-04 — privacy gate for the MCP export. When true, this
    // capture is filtered out of the personal-context snapshot. Migration 0027.
    noExport: boolean("no_export").notNull().default(false),
    // Issue #202 — user-facing favorite/star flag for quick retrieval.
    favorite: boolean("favorite").notNull().default(false),
    // Resurfacing (remind-me): optional timestamp at which this capture should
    // be surfaced back to the user in the /captures "Resurfacing today" section.
    // NULL = never resurface (the default for every existing row). Editable from
    // the detail panel and settable by JARVIS via natural language ("remind me
    // about this next Tuesday"). A capture leaves the resurfacing section when
    // this is cleared (set back to NULL) or moved to a future day. Migration 0029.
    resurfaceAt: timestamp("resurface_at", { withTimezone: true }),
    // 260615-h74 — captures-to-issues daily cron. Both columns are additive and
    // NULLABLE with no default, so existing rows are untouched. githubEvaluatedAt
    // is the "already considered" marker: it is set whenever Claude has evaluated
    // the capture (issued OR rejected) so the cron never re-evaluates it.
    // githubIssueUrl holds the created issue URL, or stays null when no issue was
    // filed (non-actionable or privacy-refused captures).
    githubIssueUrl: text("github_issue_url"),
    githubEvaluatedAt: timestamp("github_evaluated_at", { withTimezone: true }),
    // Linked-people derivation marker. NULL = the capture body has never been
    // scanned for references to known people; non-null = already derived (set by
    // lib/people/derive.ts). Guards the lazy view-time backfill so the Haiku
    // smart-match runs at most once per capture. Additive, migration 0029.
    peopleDerivedAt: timestamp("people_derived_at", { withTimezone: true }),
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
    // Partial index for the daily resurfacing query — only rows with a set
    // resurface date are indexed, keeping it tiny and skipping the NULL majority.
    index("captures_user_resurface_idx")
      .on(t.userId, t.resurfaceAt)
      .where(sql`resurface_at IS NOT NULL`),
  ],
);

// Issue #221 — rich link previews. Cached, per-user metadata for any URL that
// appears in a capture (or its `url` property). One row per (user, url); the
// fetch happens asynchronously at capture-write time and on first view, then is
// read from here rather than re-fetched on every render. `providerData` holds
// media-specific extras (YouTube video title/duration, persisted tweet text +
// author) so the content survives the source going private/deleted. Migration
// 0022, additive.
export const linkPreviews = pgTable(
  "link_previews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The URL as fetched (normalized to include a scheme). Dedup key with userId.
    url: text("url").notNull(),
    // Fetch lifecycle: 'pending' (queued/never fetched) | 'ok' (metadata cached)
    // | 'error' (fetch failed; degrade to a plain link). Drives retry + render.
    status: text("status").notNull().default("pending"),
    // Coarse media class for render branching: 'generic' | 'youtube' | 'twitter'.
    mediaType: text("media_type"),
    title: text("title"),
    description: text("description"),
    imageUrl: text("image_url"),
    faviconUrl: text("favicon_url"),
    siteName: text("site_name"),
    // Media-specific persisted payload (see LinkPreviewProviderData).
    providerData: jsonb("provider_data").$type<LinkPreviewProviderData>(),
    // Last fetch error message (truncated), when status = 'error'.
    error: text("error"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("link_previews_user_url_uniq").on(t.userId, t.url),
    index("link_previews_user_status_idx").on(t.userId, t.status),
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

// ─── PAGES ──────────────────────────────────────────────────────────────────
// Phase 20 — Notion-style markdown documents. Each page is owned by a user
// and may be linked to zero or more projects (M:N via pages_projects junction).
// Deleting a project cascades the junction row only; the page itself survives
// (unlink not delete — requirement satisfied automatically by ON DELETE CASCADE
// on the junction FK to projects, with no cascade on the pages table itself).

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    // Lossy markdown mirror of content_json. Source of truth for the MCP
    // context export, search, and portability — the editor never reads it back
    // except to seed blocks for legacy pages with no content_json yet.
    content: text("content").notNull().default(""),
    // BlockNote block document — the editor's source of truth (full fidelity:
    // callouts, etc.). Null for legacy pages, which seed from `content` markdown.
    contentJson: jsonb("content_json"),
    emoji: text("emoji"),
    // Issue #101 — Notion-style "URL" property. Optional canonical link the user
    // attaches to the page (normalized to include a scheme client-side; NULL =
    // unset). Rendered as a clickable link in the page header. Migration 0042.
    url: text("url"),
    pinned: boolean("pinned").notNull().default(false),
    // Issue #28 — Notion-style cover/banner image (migration 0042). coverImageUrl
    // holds the chosen image (an Unsplash `images.unsplash.com` URL or any direct
    // image URL the user pastes); NULL = no banner. coverImageAttribution holds the
    // Unsplash photographer credit ("Name on Unsplash") when the cover came from
    // the Unsplash picker, so the required attribution can render over the banner;
    // it stays NULL for plain image-URL covers.
    coverImageUrl: text("cover_image_url"),
    coverImageAttribution: text("cover_image_attribution"),
    // Phase 999.12 / CTX-04 — privacy gate for the MCP export. When true,
    // this page is filtered out of the personal-context snapshot.
    noExport: boolean("no_export").notNull().default(false),
    // Phase 21 (migration 0034) — direct folder placement. A page lives in at
    // most one folder, globally (not per project-link). NULL = standalone.
    // ON DELETE SET NULL reparents the page to standalone when its folder is gone.
    folderId: uuid("folder_id").references(() => pageFolders.id, { onDelete: "set null" }),
    // Phase 30 (migration 0035) — Daily Pages. NULL = a normal page; a non-NULL
    // calendar date (yyyy-MM-dd) marks this as the user's Daily Page for that day.
    // The partial unique index below enforces exactly one Daily Page per user per
    // day, leaving normal pages (daily_date IS NULL) unconstrained.
    dailyDate: date("daily_date"),
    // Wiki Renaissance (migration 0048) — base-62 fractional index for manual
    // drag-to-reorder in the Explorer (see lib/pages/position.ts). NULL = never
    // manually ordered; sort is (position_key NULLS LAST, name), so NULL rows
    // trail and fall back to name order until the first reorder seeds keys.
    positionKey: text("position_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("pages_user_updated_desc_idx").on(t.userId, sql`updated_at DESC`),
    index("pages_folder_idx").on(t.folderId),
    // One Daily Page per user per day (Phase 30). Partial: only rows with a
    // non-NULL daily_date participate, so normal pages are never constrained.
    uniqueIndex("pages_user_daily_date_uniq")
      .on(t.userId, t.dailyDate)
      .where(sql`daily_date IS NOT NULL`),
    // Per-folder ordered sibling scan for reorder/seed (migration 0048). Partial:
    // only rows that already carry a key participate.
    index("pages_user_folder_position_idx")
      .on(t.userId, t.folderId, t.positionKey)
      .where(sql`position_key IS NOT NULL`),
  ],
);

// Wiki folders (migration 0033 + 0034) — project-independent, arbitrarily
// nestable. parent_id is a nullable self-FK (NULL = root folder); deleting a
// parent cascades its subtree (Phase 21 locked decision 4). project_id was
// dropped in 0034 — folder->project links now live in the folderProjects
// junction (M:N), and a page's folder placement lives on pages.folderId.
export const pageFolders = pgTable("page_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Nullable self-FK for arbitrary-depth nesting. Lazy thunk avoids the circular
  // reference at module init; the AnyPgColumn annotation on the thunk breaks the
  // implicit-any type cycle Drizzle hits on self-references. ON DELETE CASCADE
  // deletes the whole subtree.
  parentId: uuid("parent_id").references((): AnyPgColumn => pageFolders.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  // Wiki Renaissance (migration 0048) — base-62 fractional index for manual
  // drag-to-reorder in the Explorer (see lib/pages/position.ts). NULL = never
  // manually ordered; sort is (position_key NULLS LAST, name). Standardizes
  // ordering on this key; order_index above is left unused (not dropped).
  positionKey: text("position_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("page_folders_parent_idx").on(t.parentId),
  index("page_folders_user_idx").on(t.userId),
  // Per-parent ordered sibling scan for reorder/seed (migration 0048). Partial:
  // only rows that already carry a key participate.
  index("page_folders_user_parent_position_idx")
    .on(t.userId, t.parentId, t.positionKey)
    .where(sql`position_key IS NOT NULL`),
]);

// folder_projects (migration 0034) — M:N folder->project links. user_id is
// denormalized for RLS (same pattern as pages_projects). ON DELETE CASCADE on
// both FKs. UNIQUE (folder_id, project_id) — a folder links a project at most
// once (Phase 21 locked decision 6).
export const folderProjects = pgTable("folder_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  folderId: uuid("folder_id")
    .notNull()
    .references(() => pageFolders.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized for RLS
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("folder_projects_folder_project_key").on(t.folderId, t.projectId),
  index("folder_projects_project_idx").on(t.projectId),
  index("folder_projects_user_idx").on(t.userId),
]);

export const pagesProjects = pgTable("pages_projects", {
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized; Server Actions enforce match with parent
}, (t) => [
  primaryKey({ columns: [t.pageId, t.projectId] }),
  index("pages_projects_project_idx").on(t.projectId),
  index("pages_projects_user_idx").on(t.userId),
]);

// ─── PAGE CUSTOM FIELDS (issue #165) ─────────────────────────────────────────
// Notion-style user-defined properties on wiki pages. A definition is created
// once (globally, per user) and reused across pages; a page "has" a field when a
// page_field_values row links them. The value column is jsonb so one column
// holds every type: text→string, number→number, date→"yyyy-MM-dd" string,
// checkbox→boolean, select→string[] of option ids (single-select is length ≤ 1,
// enforced in the UI + action; allow_multiple distinguishes single vs tags).

// A select option lives inline on the definition's options jsonb array.
export interface PageFieldSelectOption {
  id: string;
  label: string;
  // A palette key (see lib/pages/custom-fields.ts) for the tag chip color.
  color?: string;
}

export const pageFieldDefinitions = pgTable(
  "page_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: pageFieldTypeEnum("type").notNull(),
    // 'wiki' = applies to every page; 'folder' = defined on a top-level folder
    // (folder_id set) and cascades to that folder's descendant pages.
    scope: pageFieldScopeEnum("scope").notNull().default("wiki"),
    // Set only for scope = 'folder': the top-level folder this def belongs to.
    // ON DELETE CASCADE removes the def when its folder is deleted.
    folderId: uuid("folder_id").references(() => pageFolders.id, { onDelete: "cascade" }),
    // Only meaningful for type = 'select': the choosable options. NULL otherwise.
    options: jsonb("options").$type<PageFieldSelectOption[]>(),
    // Only meaningful for type = 'select': off = single-select, on = tags.
    allowMultiple: boolean("allow_multiple").notNull().default(false),
    // Stable display order in the properties block; lower sorts first.
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("page_field_definitions_user_idx").on(t.userId),
    index("page_field_definitions_folder_idx").on(t.folderId),
  ],
);

export const pageFieldValues = pgTable(
  "page_field_values",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    fieldDefinitionId: uuid("field_definition_id")
      .notNull()
      .references(() => pageFieldDefinitions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(), // denormalized for RLS (D-03)
    // The typed value; NULL/empty until the user fills it in. See jsonb note above.
    value: jsonb("value"),
    // Per-page override: when true, this (applicable) property is hidden on this
    // page even though its definition applies. Default visible.
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.fieldDefinitionId] }),
    index("page_field_values_field_idx").on(t.fieldDefinitionId),
    index("page_field_values_user_idx").on(t.userId),
  ],
);

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

export const tasksHashtags = pgTable("tasks_hashtags", {
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  hashtagId: uuid("hashtag_id")
    .notNull()
    .references(() => hashtags.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.hashtagId] }),
  index("tasks_hashtags_hashtag_idx").on(t.hashtagId),
  index("tasks_hashtags_user_idx").on(t.userId),
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
    // Phase 999.12 / CTX-04 — privacy gate for the MCP export. When true, this
    // fact is filtered out of the personal-context snapshot. Migration 0027.
    noExport: boolean("no_export").notNull().default(false),
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

// jarvis_page_processing_runs — issue #92 part 5. One row per "Process this
// page" invocation on a Daily Page. blockHashes snapshots a content hash per
// top-level block so the next run only re-processes new/changed blocks (no
// double-creation); processedBlockIds + actions + responseText + status feed the
// per-page "Processing runs" history dropdown. See migration 0036.
export const jarvisPageProcessingRuns = pgTable(
  "jarvis_page_processing_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    // assistant jarvis_turns row this run produced; null for 'skipped' runs.
    turnId: uuid("turn_id"),
    scope: text("scope").notNull().default("page"),
    blockHashes: jsonb("block_hashes").notNull().default(sql`'{}'::jsonb`),
    processedBlockIds: jsonb("processed_block_ids").notNull().default(sql`'[]'::jsonb`),
    actions: jsonb("actions").notNull().default(sql`'[]'::jsonb`),
    responseText: text("response_text"),
    status: text("status").notNull().default("done"), // 'done' | 'error' | 'skipped'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("jarvis_page_processing_runs_page_created_idx").on(t.pageId, sql`created_at DESC`),
    index("jarvis_page_processing_runs_user_idx").on(t.userId),
  ],
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

// cron_runs — 260615-h74. Idempotency ledger for daily Vercel crons. One row
// per (job_name, run_date); the UNIQUE (job_name, run_date) index IS the
// once-per-day lock (race-safe at the DB via insert ... onConflictDoNothing).
// Not capture-specific, so it lives among the other top-level tables.
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobName: text("job_name").notNull(),
    runDate: date("run_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status"),
  },
  (t) => [
    // This UNIQUE constraint is the once-per-day lock.
    uniqueIndex("cron_runs_job_date_uniq").on(t.jobName, t.runDate),
  ],
);

// agentmail_ingest_events — Issue #220. Idempotency ledger for AgentMail
// webhooks. AgentMail retries delivery; eventId is the durable replay key so a
// retry cannot create duplicate captures/tasks.
export const agentmailIngestEvents = pgTable(
  "agentmail_ingest_events",
  {
    eventId: text("event_id").primaryKey(),
    inboxId: text("inbox_id").notNull(),
    messageId: text("message_id").notNull(),
    sender: text("sender"),
    subject: text("subject"),
    captureId: uuid("capture_id"),
    status: text("status").notNull().default("received"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("agentmail_ingest_events_message_idx").on(t.inboxId, t.messageId),
    index("agentmail_ingest_events_created_idx").on(sql`created_at DESC`),
  ],
);

// jarvis_sms_events — Issue #352. Idempotency ledger for inbound Twilio
// SMS/MMS webhooks, mirroring agentmail_ingest_events above.
//
// Twilio retries a webhook it considers failed, and a retry must never spend a
// second Anthropic turn or file a duplicate task. `message_sid` is Twilio's
// durable per-message id, so making it the primary key turns the insert into
// the replay lock: `insert(...).onConflictDoNothing().returning()` returning an
// empty array means "already seen, stop here".
//
// The row is also the audit trail for messages that were deliberately NOT
// answered, which is why `status` carries the reason rather than the row simply
// being absent:
//   received       — accepted, turn in flight
//   ignored_sender — sender not in the allowlist (or our own number looping back)
//   disabled       — the per-user settings toggle is off; no turn was spent
//   done           — replied
//   error          — the turn or the outbound send failed; `error` has detail
//
// user_id is nullable because sender resolution happens after the row exists.
// RLS is enabled with no policies (migration 0039) exactly as
// agentmail_ingest_events is: the server connects as an RLS-bypassing role, and
// no browser should ever read a table of phone numbers.
export const jarvisSmsEvents = pgTable(
  "jarvis_sms_events",
  {
    messageSid: text("message_sid").primaryKey(),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),
    userId: uuid("user_id"),
    turnId: uuid("turn_id"),
    status: text("status").notNull().default("received"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("jarvis_sms_events_from_idx").on(t.fromNumber, t.createdAt),
    index("jarvis_sms_events_created_idx").on(sql`created_at DESC`),
  ],
);

// kiwi_dev_runs (260615-lkl). Daily summary of the local Kiwi auto-dev worker.
// One row per (user_id, run_date); the UNIQUE (user_id, run_date) index makes
// the daily POST an upsert (insert ... onConflictDoUpdate), so a re-run of the
// same day overwrites that day's row rather than appending. The owner-only
// DEVELOPMENT tab on /insights reads these newest-first. DevRunItem is
// single-sourced in lib/db/queries/dev-runs.ts and imported here for the
// items jsonb column type.
export const kiwiDevRuns = pgTable(
  "kiwi_dev_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runDate: date("run_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status"),
    issuesAttempted: integer("issues_attempted").notNull().default(0),
    issuesDone: integer("issues_done").notNull().default(0),
    issuesSkipped: integer("issues_skipped").notNull().default(0),
    issuesFailed: integer("issues_failed").notNull().default(0),
    items: jsonb("items")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<DevRunItem[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One row per owner per day; this UNIQUE constraint makes the ingest an upsert.
    uniqueIndex("kiwi_dev_runs_user_date_uniq").on(t.userId, t.runDate),
  ],
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

// desktop_devices — per-device auth tokens for the Tauri desktop app.
// Pasted once into the desktop's settings (minted from /settings/desktop on
// the web) and sent as `Authorization: Bearer hpd_...` on every API call.
// Only the hash is stored; the plaintext token is returned to the user once
// at mint time and never persisted.
export const desktopDevices = pgTable(
  "desktop_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // sha256 hex of the plaintext token (64 chars).
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("desktop_devices_user_idx").on(t.userId),
  ],
);

// user_govee_devices — per-user Govee light registrations. sku + device_id come
// from Govee discovery; name is user-facing (defaults to the discovery label).
// capabilities_cache stores the last-fetched capabilities payload (nullable until
// first sync). is_default marks the preferred light for Jarvis one-shot commands.
// Migration 0038 (RLS + unique user_id/device_id).
export const userGoveeDevices = pgTable(
  "user_govee_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    deviceId: text("device_id").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    capabilitiesCache: jsonb("capabilities_cache"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("user_govee_devices_user_device_uniq").on(t.userId, t.deviceId),
    index("user_govee_devices_user_idx").on(t.userId),
  ],
);

// claude_code_usage — daily Claude Code token totals.
// Populated by a local cron (tools/claude-code-sync.mjs) that runs ccusage
// on the user's laptop and POSTs to /api/integrations/claude-code/sync.
// PK (user_id, date) so re-syncs upsert in place.
export const claudeCodeUsage = pgTable(
  "claude_code_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
    cacheCreationTokens: bigint("cache_creation_tokens", { mode: "number" }).notNull().default(0),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    costUsd: integer("cost_usd_micros"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
  ],
);

// anthropic_api_usage — daily Anthropic API (pay-as-you-go) spend + token
// totals, mirroring claude_code_usage. Populated live from the Anthropic Cost
// API on /insights page load with best-effort write-through (DEC-1): the live
// fetch upserts the days it sees so the table stays warm and a future cron can
// take over without a UI rewrite. cost stored as integer micros (USD * 1e6).
export const anthropicApiUsage = pgTable(
  "anthropic_api_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
    cacheCreationTokens: bigint("cache_creation_tokens", { mode: "number" }).notNull().default(0),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    costUsd: integer("cost_usd_micros"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
  ],
);

// claude_subscription_usage — Claude Code Max-5x subscription snapshots
// (DEC-2 / DEC-3). Deliberately small: at most one "session" row (the active
// rolling 5-hour block, keyed by its start time) plus a handful of "week" rows
// (keyed by ISO week-start). Upserted by the same ccusage sync pipeline; the
// laptop sync overwrites in place on each run. Percentages shown in the UI are
// computed against configurable approximate Max-5x limits (limits.ts) and are
// NOT scraped real plan limits. cost stored as integer micros (USD * 1e6).
export const claudeSubscriptionUsage = pgTable(
  "claude_subscription_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "session" (active 5-hour block) or "week" (weekly rollup).
    kind: text("kind").notNull(),
    // session: the active block startTime ISO string. week: ISO week-start (YYYY-MM-DD).
    bucketKey: text("bucket_key").notNull(),
    costUsd: integer("cost_usd_micros"),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
    cacheCreationTokens: bigint("cache_creation_tokens", { mode: "number" }).notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    // ccusage `blocks --active` projection for the current block.
    projectedCostUsd: integer("projected_cost_usd_micros"),
    projectedTotalTokens: bigint("projected_total_tokens", { mode: "number" }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.bucketKey] }),
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

// ─── TRAINING ──────────────────────────────────────────────────────────────
// Phase 15 — fitness activity planner. Three tables, all userId-scoped with
// RLS in migration 0022. state_version BEFORE-triggers fire on all three so
// JARVIS state-snapshot cache invalidates correctly (D-19 / CACHE-03).
//
//   training_batches         — user-defined groupings (e.g. "Cardio", "Gym")
//   training_activity_types  — user-defined sports/activity kinds; optional
//                              batch membership; carries display color + the
//                              has_distance flag that drives the planner UI
//   training_activities      — per-day planned/logged rows; canonical km
//                              storage (display layer converts per
//                              users.distance_unit)
//
// Statuses: 'planned' → 'done' | 'cancelled' | 'skipped' (CHECK in migration).
// scheduled_date is DATE (not timestamptz) — client decides the ISO date
// string and the server stores verbatim, mirroring habit_completions so
// timezone math stays out of the server (Pitfall 7 in 15-RESEARCH.md).

export const trainingBatches = pgTable(
  "training_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("training_batches_user_order_idx").on(t.userId, t.orderIndex)],
);

export const trainingActivityTypes = pgTable(
  "training_activity_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Nullable per D-06: ungrouped types are allowed. ON DELETE SET NULL so
    // archiving/removing a batch doesn't cascade-delete its types — they
    // become ungrouped instead.
    batchId: uuid("batch_id").references(() => trainingBatches.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // OKLCH string, e.g. "oklch(65% 0.13 25)" — see lib/training/palette.ts
    // (added in a later plan). Stored as text to keep the heatmap blend math
    // (JS-side, perceptual) the canonical color authority.
    color: text("color").notNull(),
    hasDistance: boolean("has_distance").notNull().default(false),
    // lucide-react icon name (e.g. "dumbbell"); null = fall back to the color
    // swatch only. Backed by migration 0025_training_icons.sql.
    icon: text("icon"),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("training_activity_types_user_idx").on(t.userId),
    // Ordered iteration within a batch; partial because order_index only
    // matters for batched types (ungrouped renders in a separate list).
    index("training_activity_types_batch_order_idx")
      .on(t.batchId, t.orderIndex)
      .where(sql`batch_id IS NOT NULL`),
  ],
);

export const trainingActivities = pgTable(
  "training_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // ON DELETE RESTRICT — deleting a type that still has activities should
    // fail loudly so the UI can surface "archive instead?" (mirrors the
    // areas → projects pattern). See 15-RESEARCH.md Open Question 4.
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => trainingActivityTypes.id, { onDelete: "restrict" }),
    // Day-granular per D-02 (no time-of-day MVP). DATE not timestamptz so the
    // "what's on Tuesday" question is answerable in the user's local timezone
    // without server-side TZ math.
    scheduledDate: date("scheduled_date").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    plannedDurationMin: integer("planned_duration_min"),
    actualDurationMin: integer("actual_duration_min"),
    // Canonical km storage per D-10. Display layer converts to user's
    // preferred unit (users.distanceUnit). numeric(8,3) → up to 99999.999 km
    // with millimeter precision, more than enough for any human distance.
    plannedDistanceKm: numeric("planned_distance_km", { precision: 8, scale: 3 }),
    actualDistanceKm: numeric("actual_distance_km", { precision: 8, scale: 3 }),
    // 'planned' | 'done' | 'cancelled' | 'skipped' — CHECK in migration 0022.
    status: text("status").notNull().default("planned"),
    // Within-column ordering on the planner board (Claude's Discretion D-03).
    dayOrderIndex: integer("day_order_index").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Week query: WHERE user_id=$1 AND scheduled_date BETWEEN $2 AND $3.
    // Also serves the 365-day heatmap range scan.
    index("training_activities_user_date_idx").on(t.userId, t.scheduledDate),
    // Per-type aggregates on the stats surface.
    index("training_activities_user_type_idx").on(t.userId, t.activityTypeId),
    // Completed-only adherence queries — partial keeps the index tiny.
    index("training_activities_user_status_idx")
      .on(t.userId, t.status)
      .where(sql`status = 'done'`),
  ],
);

// ─── PERSONAL CONTEXT GRAPH ─────────────────────────────────────────────────
// Phase 999.12 — daily snapshot storage for the MCP export. One row per
// (user_id, snapshot_date) so re-running the builder on the same day is an
// idempotent upsert. RLS is owner-only (auth.uid() = user_id) per migration
// 0026; NOT in the supabase_realtime publication (RESEARCH.md Pitfall 4 —
// snapshots don't need live updates and broadcasting them would leak the
// JSON payload over websockets).
//
// schema_version supports forever-snapshot read-time migrations — never
// mutate historical rows; route old payloads through a pure migrate function
// on read instead (RESEARCH.md Pitfall 3).

export const personalContextSnapshots = pgTable(
  "personal_context_snapshots",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    // Typed by Plan 02's ContextSnapshot Zod schema. Plain jsonb here so this
    // schema file stays free of cross-package imports (would otherwise create
    // a circular dependency schema.ts → context/build-snapshot.ts → schema.ts).
    // Plan 02 will cast at the query site instead.
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.snapshotDate] }),
  ],
);

// ─── NUTRITION ──────────────────────────────────────────────────────────────
// Phase 17 — nutrition tracker. Five tables, all userId-scoped with RLS in
// migration 0029. state_version BEFORE-triggers fire on food_logs + meals so
// JARVIS state-snapshot cache invalidates on nutrition writes (D-14 prep).
//
//   foods                — canonical food registry (OFF-sourced or manual)
//   food_serving_options — per-food selectable serving units (D-05/D-06)
//   food_logs            — per-day per-meal-slot log entries
//   meals                — saved reusable meal groupings
//   meal_items           — foods+servings inside a saved meal

export const foods = pgTable("foods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // OFF barcode — null for manual entries and generic foods
  offBarcode: text("off_barcode"),
  name: text("name").notNull(),
  brand: text("brand"),
  // Per-100g macros — the canonical source of truth (D-04)
  kcalPer100g: numeric("kcal_per_100g", { precision: 8, scale: 2 }).notNull(),
  proteinPer100g: numeric("protein_per_100g", { precision: 8, scale: 2 }).notNull(),
  carbsPer100g: numeric("carbs_per_100g", { precision: 8, scale: 2 }).notNull(),
  fatPer100g: numeric("fat_per_100g", { precision: 8, scale: 2 }).notNull(),
  // Optional secondary macros — store if present in OFF data
  fiberPer100g: numeric("fiber_per_100g", { precision: 8, scale: 2 }),
  sodiumPer100g: numeric("sodium_per_100g", { precision: 8, scale: 2 }), // grams (÷1000 to display mg)
  // Base unit for this food: "g" | "ml"
  baseUnit: text("base_unit").notNull().default("g"),
  // Manual = no OFF barcode; determines whether to offer "find in OFF" shortcut
  isManual: boolean("is_manual").notNull().default(false),
  // Track usage for "personal history" sort ordering (D-02)
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("foods_user_last_used_idx").on(t.userId, sql`last_used_at DESC`),
  uniqueIndex("foods_user_barcode_uniq").on(t.userId, t.offBarcode).where(sql`off_barcode IS NOT NULL`),
]);

export const foodServingOptions = pgTable("food_serving_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  foodId: uuid("food_id").notNull().references(() => foods.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized for RLS (pattern from tasksProjects)
  label: text("label").notNull(),     // e.g., "1 cup", "1 slice", "100 g", "1 medium"
  gramsOrMl: numeric("grams_or_ml", { precision: 8, scale: 2 }).notNull(), // base-unit equivalent
  isDefault: boolean("is_default").notNull().default(false),
  orderIndex: integer("order_index").notNull().default(0),
}, (t) => [
  index("food_serving_options_food_idx").on(t.foodId),
  index("food_serving_options_user_idx").on(t.userId),
]);

export const mealSlotEnum = pgEnum("meal_slot", ["breakfast", "lunch", "dinner", "snacks"]);

export const foodLogs = pgTable("food_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  logDate: date("log_date").notNull(),        // ISO date "YYYY-MM-DD" (client timezone, not server)
  mealSlot: mealSlotEnum("meal_slot").notNull(),
  foodId: uuid("food_id").notNull().references(() => foods.id, { onDelete: "restrict" }),
  servingOptionId: uuid("serving_option_id").references(() => foodServingOptions.id, { onDelete: "set null" }),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull(), // multiplier of serving unit
  // Snapshotted macros at log time — immutable to future food edits (KEY PATTERN)
  kcal: integer("kcal").notNull(),
  proteinG: numeric("protein_g", { precision: 8, scale: 2 }).notNull(),
  carbsG: numeric("carbs_g", { precision: 8, scale: 2 }).notNull(),
  fatG: numeric("fat_g", { precision: 8, scale: 2 }).notNull(),
  fiberG: numeric("fiber_g", { precision: 8, scale: 2 }),
  // Display: quantity × servingOption.label (reconstructed in UI)
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("food_logs_user_date_idx").on(t.userId, t.logDate),
  index("food_logs_user_date_slot_idx").on(t.userId, t.logDate, t.mealSlot),
]);

export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("meals_user_last_used_idx").on(t.userId, sql`last_used_at DESC`)]);

export const mealItems = pgTable("meal_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealId: uuid("meal_id").notNull().references(() => meals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  foodId: uuid("food_id").notNull().references(() => foods.id, { onDelete: "restrict" }),
  servingOptionId: uuid("serving_option_id").references(() => foodServingOptions.id, { onDelete: "set null" }),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull(),
  orderIndex: integer("order_index").notNull().default(0),
}, (t) => [
  index("meal_items_meal_idx").on(t.mealId),
  index("meal_items_user_idx").on(t.userId),
]);

// One row per user — upserted on save (ON CONFLICT user_id DO UPDATE)
export const nutritionTargets = pgTable("nutrition_targets", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  targetKcal: integer("target_kcal").notNull().default(2000),
  proteinPct: numeric("protein_pct", { precision: 5, scale: 2 }).notNull().default("30"), // % of calories
  carbsPct: numeric("carbs_pct", { precision: 5, scale: 2 }).notNull().default("40"),
  fatPct: numeric("fat_pct", { precision: 5, scale: 2 }).notNull().default("30"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // CHECK: protein_pct + carbs_pct + fat_pct = 100 — enforced in migration SQL
});

// ─── JOURNALING ─────────────────────────────────────────────────────────────
// Phase 20 — daily journal entries. One row per user per calendar day, keyed by
// the UNIQUE(user_id, date) constraint so writes upsert via ON CONFLICT (CONTEXT
// decision 1). The journaling prompt itself is a fixed UI constant, not a column.
// state_version BEFORE-trigger fires on journal_entries (migration 0030) so the
// JARVIS state-snapshot cache invalidates on journal writes, matching the other
// primary tables.
//
//   journal_entries — main_response (fixed-prompt answer) + notes_section (misc)
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // DATE only, no time component — the client-local calendar day "YYYY-MM-DD",
    // not raw server UTC (CONTEXT specific; mirrors food_logs.log_date intent).
    date: date("date").notNull(),
    mainResponse: text("main_response"), // nullable — response to the fixed prompt
    notesSection: text("notes_section"), // nullable — the separate Notes / Misc field
    // Privacy gate for the MCP export. When true, this entry is filtered out
    // of the personal-context snapshot. Journal entries default to true (opt-in
    // export) per issue #191 — migration 0045 flips the default and existing rows.
    noExport: boolean("no_export").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One entry per user per calendar day; enforces upsert at the DB level
    // (CONTEXT decision 1 — ON CONFLICT (user_id, date) target).
    uniqueIndex("journal_entries_user_date_uniq").on(t.userId, t.date),
    // History-feed ordering (most-recent-first), mirroring captures_user_created_desc_idx.
    index("journal_entries_user_date_desc_idx").on(t.userId, sql`date DESC`),
  ],
);

// ─── PEOPLE ─────────────────────────────────────────────────────────────────
// Phase: People — first-class person entity for the knowledge graph. People are
// curatable contacts (email / phone / bio / avatar / tags) that can be
// @-mentioned from anywhere there is text (wiki pages, captures, JARVIS chat)
// and linked to tasks/captures/events. The Notion-style "people" property: any
// entity can reference one or more people via people_references.
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"), // nullable — curated later
    phone: text("phone"), // nullable
    bio: text("bio"), // nullable — "who they are to me"
    // Public URL into the `avatars` Supabase Storage bucket. null → render the
    // person's initials as the default avatar.
    avatarUrl: text("avatar_url"),
    // Free-form tags (friend / investor / teacher / professor / code / …). A
    // text[] so the People page can filter by tag without a join table — the
    // canonical tag list is curated client-side but the column accepts any
    // string for forward flexibility.
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("people_user_idx").on(t.userId),
    // Case-insensitive resolve-or-create: @-mention + JARVIS look people up by
    // (userId, lower(name)). A non-unique index keeps lookups fast while still
    // allowing intentional namesakes.
    index("people_user_name_idx").on(t.userId, sql`lower(name)`),
  ],
);

// people_references — one row per (from-entity → person) mention. The from
// entity is identified by a (type, id) pair rather than a hard FK because the
// referencing entity can be a task, capture, page, or jarvis_fact. userId is
// denormalized for RLS, matching every other junction table. References are
// reconciled on save (parse the entity's content for person mentions, then
// diff against existing rows), so this table is the single source of truth for
// "what mentions whom" and powers reference counts + the knowledge graph.
export const peopleReferences = pgTable(
  "people_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // denormalized for RLS
    // "task" | "capture" | "page" | "jarvis_fact" | "event"
    fromType: text("from_type").notNull(),
    fromId: uuid("from_id").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // At most one reference per (from-entity, person) — re-saving an entity that
    // mentions the same person twice collapses to one row.
    unique("people_references_from_person_uniq").on(t.fromType, t.fromId, t.personId),
    index("people_references_person_idx").on(t.personId),
    index("people_references_user_idx").on(t.userId),
    index("people_references_from_idx").on(t.fromType, t.fromId),
  ],
);

// entity_references — one row per (source entity → target entity) reference,
// the general form of people_references: instead of a person-shaped far end it
// stores a (targetType, targetId) pair, so any entity can reference any other.
// Neither end carries a hard FK because both are polymorphic; userId is
// denormalized for RLS like every other junction table here. Rows are
// reconciled on save (parse the source's text for @[label](ref://type/uuid)
// tokens, diff against existing rows — see lib/references/reconcile.ts), which
// makes this the queryable projection of tokens that otherwise only exist
// inside free text: it powers backlinks, reference counts, and the captures
// graph's co_reference edges.
export const entityReferences = pgTable(
  "entity_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "capture" | "task" | "page" | "jarvis_turn"
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    // "capture" | "task" | "page" | "project" | "area" | "person"
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // At most one reference per (source, target) — a source naming the same
    // target twice collapses to one row, which is what lets the reconcile diff
    // stay idempotent.
    unique("entity_references_source_target_uniq").on(
      t.sourceType,
      t.sourceId,
      t.targetType,
      t.targetId,
    ),
    // "what references this entity" — backlinks, counts, graph.
    index("entity_references_target_idx").on(t.targetType, t.targetId),
    index("entity_references_user_idx").on(t.userId),
    // "what does this entity reference" — the reconcile read, on every save.
    index("entity_references_source_idx").on(t.sourceType, t.sourceId),
  ],
);

// entity_embeddings — one gte-small (384-dim) vector per referenceable entity,
// backing the STAGED semantic reference search (U7). The exact @-mention search
// (searchEntityMentions, S4) does not touch this; it powers a second, flag-gated
// "Related" section that finds entities a literal query would miss. Vectors are
// produced by the embed-entity edge function's built-in Supabase.ai inference
// (no external vendor). contentHash is sha256 of the normalized (title + body)
// the embedding was built from — an unchanged hash on save lets the enqueue
// short-circuit the embed round trip. userId denormalized for RLS; entityId
// carries no FK because the target is polymorphic, same as entity_references.
export const entityEmbeddings = pgTable(
  "entity_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "capture" | "task" | "page" | "project" | "area" | "person"
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One embedding per entity; the enqueue upserts on this constraint.
    unique("entity_embeddings_entity_uniq").on(t.entityType, t.entityId),
    // Cosine ANN index — HNSW over IVFFlat at single-user scale (see 0036).
    index("entity_embeddings_embedding_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("entity_embeddings_user_idx").on(t.userId),
  ],
);

// whatsapp_messages — messages synced from the local lharries/whatsapp-mcp
// Go bridge (which owns the whatsmeow session and its own SQLite mirror).
// A small local sync worker (tools/whatsapp-sync/sync.mjs) reads new rows
// out of that bridge and POSTs them to /api/whatsapp/ingest, which upserts
// them here. The server-side `read_whatsapp` JARVIS tool then queries this
// table so briefings + agent turns can see WhatsApp with zero mid-turn
// desktop round-trip (desktop tool execution is fire-and-forget).
//
// externalId is the bridge's messages.id (whatsmeow-supplied). The unique
// (userId, chatJid, externalId) key gives the ingest route a safe upsert
// target — replays never duplicate.
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    chatJid: text("chat_jid").notNull(),
    chatName: text("chat_name"),
    sender: text("sender"),
    senderName: text("sender_name"),
    fromMe: boolean("from_me").notNull().default(false),
    body: text("body"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("whatsapp_messages_user_chat_external_uniq").on(
      t.userId,
      t.chatJid,
      t.externalId,
    ),
    index("whatsapp_messages_user_sent_at_idx").on(t.userId, t.sentAt.desc()),
  ],
);

// imessage_messages — messages synced from the local macOS Messages chat.db
// by a small local sync worker (separate unit `imessage-sync`) that reads
// new rows out of ~/Library/Messages/chat.db and POSTs them to
// /api/imessage/ingest, which upserts them here. The server-side
// `read_imessage` JARVIS tool then queries this table so briefings + agent
// turns can see iMessage with zero mid-turn desktop round-trip.
//
// externalId is the Messages row's stable id (guid). chatJid is the chat
// guid; sender is the raw handle (phone/email); senderName is the resolved
// contact display name (the sync worker resolves it via Contacts). The
// unique (userId, chatJid, externalId) key gives the ingest route a safe
// upsert target — replays never duplicate.
export const imessageMessages = pgTable(
  "imessage_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    chatJid: text("chat_jid").notNull(),
    chatName: text("chat_name"),
    sender: text("sender"),
    senderName: text("sender_name"),
    fromMe: boolean("from_me").notNull().default(false),
    body: text("body"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("imessage_messages_user_chat_external_uniq").on(
      t.userId,
      t.chatJid,
      t.externalId,
    ),
    index("imessage_messages_user_sent_at_idx").on(t.userId, t.sentAt.desc()),
  ],
);

// routines — natural-language JARVIS routines (one row = triggers → ordered
// agentic blocks). The freeform payload lives in the typed `spec` jsonb column;
// scheduler-relevant fields are denormalized into first-class columns
// (triggerTypes, nextRunAt), recomputed on every write from the validated spec.
// Migration 0023 (RLS + indexes). See @hyperpolymath/jarvis-core/routines.
export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    spec: jsonb("spec").$type<RoutineSpec>().notNull().default(sql`'{}'::jsonb`),
    triggerTypes: text("trigger_types").array().notNull().default(sql`'{}'`),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("routines_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    index("routines_next_run_idx").on(t.enabled, t.nextRunAt),
    index("routines_trigger_types_gin").using("gin", t.triggerTypes),
  ],
);

// jarvis_personality_config — one row per user (UNIQUE user_id). Tunes JARVIS's
// SPOKEN VOICE (persona preset + formality/verbosity/wit dials + freeform custom
// instructions) via a short directive block injected into the cached system
// prefix (see @hyperpolymath/jarvis-core buildPersonalityTuningBlock). Migration
// 0025 (RLS + unique index). CRITICAL: the column DEFAULTS reproduce TODAY's
// canon voice exactly (canon/formal/concise/dry, no custom text), so an absent
// or all-default row changes nothing about how JARVIS sounds.
export const jarvisPersonalityConfig = pgTable(
  "jarvis_personality_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    // canon | minimal | storyteller
    preset: text("preset").notNull().default("canon"),
    // formal | balanced | casual
    formality: text("formality").notNull().default("formal"),
    // concise | balanced | expansive
    verbosity: text("verbosity").notNull().default("concise"),
    // dry | moderate | playful
    wit: text("wit").notNull().default("dry"),
    customInstructions: text("custom_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("jarvis_personality_config_user_idx").on(t.userId)],
);

// jarvis_startup_config — one row per user (UNIQUE user_id). Mirrors the desktop
// startup config shape (apps/desktop/src/settings.ts): whether the morning
// briefing runs on launch, plus the URLs/apps to open and Shortcuts to run at
// startup. Web is the source of truth; the desktop reads this via the bearer-auth
// GET route. Migration 0025 (RLS + unique index); 0037 flips the briefing
// default OFF (opt-in). DEFAULTS: briefing OFF (no unsolicited wake greeting),
// empty open/shortcut lists.
export const jarvisStartupConfig = pgTable(
  "jarvis_startup_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    briefingEnabled: boolean("briefing_enabled").notNull().default(false),
    // Array<{ type: "url" | "app"; value: string }>
    openOnStart: jsonb("open_on_start")
      .$type<Array<{ type: "url" | "app"; value: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // string[] — macOS Shortcuts to run at startup.
    startupShortcuts: jsonb("startup_shortcuts")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("jarvis_startup_config_user_idx").on(t.userId)],
);

// briefing_editions — one curated daily digest per user per day. The curator
// (gpt-4o-mini) writes a headline + intro summary; the constituent stories live
// in briefing_items. UNIQUE(user_id, edition_date) makes the daily refresh an
// idempotent upsert (re-running a day replaces, never duplicates).
export const briefingEditions = pgTable(
  "briefing_editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    editionDate: date("edition_date").notNull(),
    headline: text("headline").notNull().default(""),
    summary: text("summary").notNull().default(""),
    model: text("model").notNull().default("gpt-4o-mini"),
    itemCount: integer("item_count").notNull().default(0),
    rawSourceCount: integer("raw_source_count").notNull().default(0),
    status: text("status").notNull().default("ready"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("briefing_editions_user_date_key").on(t.userId, t.editionDate),
    index("briefing_editions_user_generated_idx").on(
      t.userId,
      t.generatedAt.desc(),
    ),
  ],
);

// briefing_items — the individual curated stories that make up an edition.
// `section` is stored as text (not an enum) so the LLM curator can evolve the
// taxonomy without a migration; the app validates against BRIEFING_SECTIONS.
export const briefingItems = pgTable(
  "briefing_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => briefingEditions.id, { onDelete: "cascade" }),
    section: text("section").notNull().default("general"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    url: text("url"),
    sourceName: text("source_name").notNull().default(""),
    score: integer("score").notNull().default(0),
    orderIndex: integer("order_index").notNull().default(0),
    meta: jsonb("meta").$type<BriefingItemMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("briefing_items_edition_idx").on(
      t.editionId,
      t.section,
      t.orderIndex,
    ),
    index("briefing_items_user_idx").on(t.userId),
  ],
);
