# PRIVACY — `@hyperpolymath/personal-context-mcp`

> The exact field-level allowlist for the v1 read-only personal-context
> MCP server. The repo is open source; this file is the canonical record of
> what an external agent connected to your server can and cannot see.

## 1. What this server exposes

A daily-built, typed personal-context snapshot derived from your
hyperpolymath data (areas, projects, tasks, captures, training, habits,
JARVIS facts), scoped via bearer token to a single `user_id`, **read-only**.
The snapshot is a *derived* artifact — not a live view of your database.
External agents see only the latest snapshot (full payload) and metadata
for the prior 30 days. No raw table access, no write tools, no semantic
query (the `query_context` semantic-search tool is deferred to phase
999.12.1).

The snapshot is built by `apps/web/lib/context/build-snapshot.ts` at
00:00 ET (05:00 UTC) every day by a Vercel cron job, or on demand via
the `/settings/context` "Rebuild now" button. Each build writes one row
to `personal_context_snapshots` keyed on `(user_id, snapshot_date)` — a
re-run on the same day is an idempotent upsert.

## 2. Privacy primitives

- **`no_export = true` rows are filtered at snapshot build time.** Any
  row in `captures`, `tasks`, or `jarvis_facts` with `no_export = true`
  never reaches the snapshot payload — and therefore never reaches the
  MCP. The count of filtered rows is surfaced as
  `meta.excludedNoExportCount` in the snapshot itself, so you can
  verify the filter ran.
- **Snapshots are immutable.** Once a daily snapshot row is written,
  it is never UPDATEd. Toggling `no_export = true` on a row AFTER a
  snapshot was built does NOT retroactively scrub it from historical
  snapshots — only future snapshots will respect the new flag. This is
  a known limitation; phase 999.12.1 will address retroactive scrubbing
  alongside the deferred `query_context` semantic-search tool. If you
  need a row purged from history immediately, run a one-off SQL update
  to scrub the JSONB payloads of affected historical snapshot rows.
- **Bearer tokens are SHA-256 hashed at rest.** The plaintext token is
  generated client-side at mint time, returned to you exactly once by
  the `/settings/mcp-tokens` page, and only its SHA-256 hash is stored
  in `integration_tokens.access_token`. There is no way to retrieve a
  lost token — you must revoke and re-mint.
- **Token rotation cadence: 90 days (warn-only in v1).** The
  `/settings/mcp-tokens` page will surface a warning if a token's
  `created_at` is older than 90 days. v1 does not auto-rotate or
  auto-revoke; that's a follow-up enhancement.
- **One MCP token per user in v1.** The `integration_tokens` composite
  PK `(user_id, provider='mcp_agent')` means re-minting overwrites the
  existing token. Multi-token support is a small follow-up migration
  deferred to a later phase.

## 3. Field allowlist per node type

The Zod schemas in `src/types.ts` are the contract — anything not listed
on the schema is dropped. Below is the column-level mapping per source
table, including columns explicitly NOT exported and why.

### 3.1 `area` node — sourced from `areas` table

| Source column (`areas.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| `name` | yes (as `node.name`) | free-text |
| `emoji` | yes (as `node.emoji`) | nullable; raw value |
| `order_index` | yes (as `node.orderIndex`) | int |
| `user_id` | no | enforcement only (loader scopes by it) |
| `archived_at` | no | loader filters archived areas out |
| `created_at` | no | not relevant to agent context |
| `updated_at` | no | not relevant to agent context |

### 3.2 `project` node — sourced from `projects` table

| Source column (`projects.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| `area_id` | yes (as `node.areaId`) | foreign key, exported as-is |
| `name` | yes (as `node.name`) | free-text |
| `is_class` | yes (as `node.isClass`) | boolean |
| `archived_at` | yes (as `node.archived`, boolean projection) | "is this project archived?" |
| `start_date` | yes (as `node.startDate`) | nullable YYYY-MM-DD |
| `end_date` | yes (as `node.endDate`) | nullable YYYY-MM-DD |
| `description` | no | free-form prose; may contain private context |
| `icon` / `banner_url` | no | UI presentation only |
| `course_code` / `course_title` / `instructor` / `grade` / `credits` / `distributionals` / `semester_term` / `semester_year` | no | academic metadata not part of v1 graph contract (may be added in a future schemaVersion bump) |
| `user_id` / `order_index` / `created_at` / `updated_at` | no | enforcement or UI only |

### 3.3 `task` node — sourced from `tasks` table

| Source column (`tasks.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| `title` | yes (as `node.title`) | free-text |
| `priority` | yes (as `node.priority`) | enum: P∞ \| P1 \| P2 \| P3 |
| `status` | yes (as `node.status`) | enum: not started \| up next \| in progress \| almost done \| lesno |
| `due_date` | yes (as `node.dueDate`) | nullable YYYY-MM-DD |
| (junction) `tasks_projects.project_id` | yes (as `node.projectIds[]`) | joined via the denormalized junction table |
| `notes` | no | may contain private context |
| `no_export` | no | enforcement only — loader filters rows where true and increments `meta.excludedNoExportCount` |
| `kanban_position` | no | UI ordering only |
| `completed_at` | no | already reflected by `status='lesno'` |
| `user_id` / `created_at` / `updated_at` | no | enforcement or not relevant |

### 3.4 `capture` node — sourced from `captures` table

| Source column (`captures.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| `content` | yes (as `node.text`), **truncated to 500 chars** | full text never exported (RESEARCH.md Pitfall 2 — payload bloat cap) |
| `created_at` | yes (as `node.createdAt`) | ISO 8601 |
| (junction) `captures_hashtags ⋈ hashtags.display_name` | yes (as `node.tags[]`) | display-cased tag names, joined via the denormalized junctions |
| (junction) `captures_projects.project_id` | yes (as `node.projectIds[]`) | joined via the denormalized junction |
| `no_export` | no | enforcement only — loader filters + counts |
| `created_via` | no | internal taxonomy ('jarvis' vs manual) — not agent-relevant |
| `content_search` (tsvector) | no | search-engine implementation detail |
| `user_id` / `updated_at` | no | enforcement or not relevant |
| **loader cap** | last 50 captures only | RESEARCH.md Pitfall 2 — keep snapshot under a few MB |

### 3.5 `training_activity` node — sourced from `training_activities` table

| Source column (`training_activities.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| (joined) `training_activity_types.name` | yes (as `node.kind`) | activity-type display name (e.g. "run", "ride") |
| `actual_duration_min` || `planned_duration_min` | yes (as `node.durationMin`) | actual preferred (snapshot answers "what happened"); planned fallback for still-on-board activities |
| `actual_distance_km` || `planned_distance_km` | yes (as `node.distanceKm`) | canonical km storage; same actual-preferred rule |
| `scheduled_date` | yes (as `node.occurredAt`) | YYYY-MM-DD |
| `title` / `description` | no | free-form, may contain private context |
| `status` / `day_order_index` / `completed_at` | no | UI / state machine detail |
| `activity_type_id` | no | dereferenced via the join above |
| `user_id` / `created_at` / `updated_at` | no | enforcement or not relevant |
| **loader cap** | last 30 activities only | snapshot represents recent activity window |

### 3.6 `habit` node — sourced from `habits` table

| Source column (`habits.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| `name` | yes (as `node.name`) | free-text |
| (derived) walk-backwards-from-today over `habit_completions` WHERE status='done' | yes (as `node.currentStreak`) | "how many consecutive days has this habit been kept" |
| `description` / `icon` | no | UI / private context |
| `days_of_week` | no | schedule belongs to the habit-management surface, not the snapshot |
| `archived_at` / `order_index` | no | UI / enforcement only |
| `user_id` / `created_at` / `updated_at` | no | enforcement or not relevant |

### 3.7 `jarvis_fact` node — sourced from `jarvis_facts` table

| Source column (`jarvis_facts.*`) | In snapshot? | Notes |
|---|---|---|
| `id` | yes (as `node.id`) | UUID, identity |
| `value` | yes (as `node.text`) | the user-readable fact text |
| `created_at` | yes (as `node.createdAt`) | ISO 8601 |
| `type` / `key` | no | internal taxonomy — not agent-relevant |
| `source` | no | provenance ('user' / 'jarvis_suggested') — not agent-relevant |
| `no_export` | no | enforcement only — loader filters + counts |
| `last_used_at` / `updated_at` | no | internal observability |
| `user_id` | no | enforcement only |

## 4. Edge types

The snapshot includes five edge types (the v1 discriminated union):

| Edge type | `from` | `to` / extra | Meaning |
|---|---|---|---|
| `project_in_area` | `project.id` | `to: area.id` | project belongs to an area |
| `task_in_project` | `task.id` | `to: project.id` | task is linked to a project (joined via `tasks_projects`) |
| `capture_in_project` | `capture.id` | `to: project.id` | capture is linked to a project (joined via `captures_projects`) |
| `capture_tagged` | `capture.id` | `tag: string` | capture is tagged with a hashtag (display-cased) |
| `fact_about` | `jarvis_fact.id` | `entityType: 'area' \| 'project'`, `entityId: uuid` | fact is about a specific area/project (only emitted when both fields present; v1 does not expose these in the source data yet — forward-compatible) |

Edges are derived purely from in-memory nodes by
`apps/web/lib/context/edges.ts` — no second DB round trip. The
`get_current_context` tool's `topics[]` filter applies to NODES ONLY;
edges are returned in full.

## 5. What is NEVER exported

The following are explicitly excluded by design and will never appear in a
snapshot payload, even at the cost of agent context quality:

- **Google Calendar event content.** GCal is the source of truth for
  scheduling and is queried separately; the snapshot only references
  the typed projects/tasks/captures, not your raw calendar.
- **Authentication tokens, refresh tokens, integration secrets.** None
  of `integration_tokens.access_token`, `refresh_token`, or
  `expires_at` are exported. The MCP server cannot leak its own (or any
  other integration's) credentials.
- **OAuth tokens for Google / Strava / any third party.** Same as above.
- **`jarvis_events`** (per-turn telemetry) — internal observability
  only; not part of the v1 snapshot contract.
- **`jarvis_turns`** (persisted scrollback / conversation history) —
  raw conversation prose lives outside the snapshot; the snapshot only
  surfaces facts you explicitly committed via `remember_fact`.
- **Voice transcripts.** No STT/TTS content is persisted in the graph.
- **Anything from a row with `no_export = true`** on `captures`,
  `tasks`, or `jarvis_facts`.
- **The full `content_search` tsvector** or any other database
  implementation detail.

## 6. Schema versioning

The snapshot payload is tagged with `schemaVersion: 1` (the current
version, exported as `CURRENT_SCHEMA_VERSION` from `src/types.ts`). The
forever-snapshot invariant:

- **Snapshots are never UPDATEd.** New fields are added by bumping the
  schema version and registering a pure migrator in
  `apps/web/lib/context/migrate.ts`. Historical rows stay exactly as
  written.
- **Readers route through `migrate(payload, fromVersion)` at read
  time.** If the historical row's `schemaVersion` matches the current
  version, the payload passes through unchanged. If it's older and a
  migrator is registered, the migrator runs (pure function, no DB
  reads). If it's older and no migrator exists, the payload is returned
  wrapped in `{ _legacy: true, payload }` so the caller can drop it
  gracefully without crashing. If it's *newer* than CURRENT (impossible
  under normal flow, but possible after a downgrade), the reader fails
  loudly.
- **This package's `src/types.ts` schemas must stay in lock-step with
  `apps/web/lib/context/types.ts`.** When you bump the schema, bump
  both copies and add a migrator in the apps/web side. The MCP server
  only ever sees already-migrated payloads — the migration happens at
  the apps/web boundary before the payload reaches the MCP route.

---

*This file is the open-source-public contract for what data leaves your
Postgres database via the MCP server. If you find an exported field you
think should be filtered, open an issue or send a PR against this file
AND the corresponding loader in `apps/web/lib/context/nodes/`.*
