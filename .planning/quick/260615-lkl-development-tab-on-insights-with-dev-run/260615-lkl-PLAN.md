---
phase: 260615-lkl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/db/schema.ts
  - apps/web/drizzle/0015_kiwi_dev_runs.sql
  - apps/web/app/api/dev-runs/route.ts
  - apps/web/lib/db/queries/dev-runs.ts
  - apps/web/app/(app)/insights/page.tsx
  - apps/web/components/insights/InsightsTabs.tsx
  - apps/web/components/insights/DevelopmentTabPanel.tsx
  - apps/web/.env.local.example
autonomous: true
requirements: [DEVRUN-01, DEVRUN-02, DEVRUN-03, DEVRUN-04, DEVRUN-05, DEVRUN-06]
user_setup:
  - service: dev-run-ingest
    why: "The local Kiwi auto-dev worker authenticates to /api/dev-runs with a shared bearer token; prod also needs the owner email to resolve the target user."
    env_vars:
      - name: DEV_RUN_INGEST_SECRET
        source: "Self-generated shared secret (e.g. openssl rand -hex 32); set identically on the local worker and in Vercel project env."
      - name: GITHUB_ISSUE_USER_EMAIL
        source: "Already present from the captures-to-issues cron work; owner's users.email. Confirm it is set in Vercel."

must_haves:
  truths:
    - "A correctly-tokenized POST to /api/dev-runs upserts exactly one kiwi_dev_runs row per (owner userId, runDate)."
    - "A POST with a missing, malformed, or wrong bearer token is rejected with 401 before any DB read or write."
    - "When DEV_RUN_INGEST_SECRET is unset on the server the endpoint fails closed (never writes, never returns ok)."
    - "The owner (user.email === GITHUB_ISSUE_USER_EMAIL) sees a DEVELOPMENT tab on /insights listing recent auto-dev runs newest-first."
    - "A non-owner never sees the DEVELOPMENT tab and never has dev-run rows fetched for them."
    - "The migration file exists for review but is NOT applied to any database by the executor."
  artifacts:
    - path: "apps/web/lib/db/schema.ts"
      provides: "kiwiDevRuns table mapping to kiwi_dev_runs with UNIQUE (user_id, run_date)"
      contains: "kiwiDevRuns"
    - path: "apps/web/drizzle/0015_kiwi_dev_runs.sql"
      provides: "Additive hand-written migration (CREATE TABLE IF NOT EXISTS + unique index)"
      contains: "kiwi_dev_runs"
    - path: "apps/web/app/api/dev-runs/route.ts"
      provides: "Token-gated POST ingest endpoint; the only write path for kiwi_dev_runs"
      exports: ["POST", "runtime", "dynamic"]
    - path: "apps/web/lib/db/queries/dev-runs.ts"
      provides: "getRecentDevRuns read helper plus exported DevRunItem and DevRun types"
      exports: ["getRecentDevRuns", "DevRunItem", "DevRun"]
    - path: "apps/web/components/insights/DevelopmentTabPanel.tsx"
      provides: "Owner-only panel rendering runs and per-item rows with branch links"
      contains: "DevelopmentTabPanel"
  key_links:
    - from: "apps/web/app/api/dev-runs/route.ts"
      to: "kiwiDevRuns table"
      via: "insert(...).onConflictDoUpdate({ target: [userId, runDate] })"
      pattern: "onConflictDoUpdate"
    - from: "apps/web/app/(app)/insights/page.tsx"
      to: "getRecentDevRuns"
      via: "isDevOwner-gated fetch passed as development prop"
      pattern: "getRecentDevRuns"
    - from: "apps/web/components/insights/InsightsTabs.tsx"
      to: "DevelopmentTabPanel"
      via: "development prop truthiness gates tab + panel"
      pattern: "development"
---

<objective>
Build the prod-side reporting surface for the local Kiwi auto-dev automation. A local
worker POSTs a daily run summary to a new token-gated endpoint, the summary upserts into a
new kiwi_dev_runs table, and an owner-only DEVELOPMENT tab on /insights renders it.

Purpose: give the owner a single prod surface that shows what the local auto-dev worker did
each day (issues attempted, done, skipped, failed, with branch links), without exposing any
of it to other users and without opening a second write path to the data.

Output:
- kiwiDevRuns table in the Drizzle schema with UNIQUE (user_id, run_date).
- Hand-written additive migration 0015_kiwi_dev_runs.sql (file only; NOT applied).
- POST /api/dev-runs ingest endpoint whose auth mirrors the captures-to-issues cron exactly.
- getRecentDevRuns read helper with shared DevRunItem / DevRun types.
- Owner-gated DEVELOPMENT tab and DevelopmentTabPanel on /insights.
- DEV_RUN_INGEST_SECRET (and GITHUB_ISSUE_USER_EMAIL if missing) in .env.local.example.

Owner gating is twofold and both halves must be correct:
- WRITES are gated by the DEV_RUN_INGEST_SECRET bearer token (the worker holds it).
- TAB VISIBILITY and READS are gated by user.email === GITHUB_ISSUE_USER_EMAIL.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Auth pattern to mirror EXACTLY for the endpoint (nodejs runtime, force-dynamic,
# Bearer secret via node:crypto timingSafeEqual length-guarded, fail-closed,
# owner resolved by GITHUB_ISSUE_USER_EMAIL via users.email).
@apps/web/app/api/cron/captures-to-issues/route.ts

# Hand-written migration convention (next file is 0015). CRITICAL: drizzle meta
# snapshots are frozen at 0009, so drizzle-kit generate must NOT be run.
@apps/web/drizzle/0014_captures_to_issues.sql

# Schema style: table definitions, jsonb columns, uniqueIndex, date/timestamp helpers.
# cron_runs (~line 441) and captures (~line 178) are the closest analogs.
@apps/web/lib/db/schema.ts

# Insights server page (requireOnboarded returns user.email; Promise.all fetch; props to tabs).
@apps/web/app/(app)/insights/page.tsx

# Client tab switcher (Tab union + TabButton). Add the development tab here.
@apps/web/components/insights/InsightsTabs.tsx

# Styling + empty-state conventions to match (tokens, font-mono small-caps labels, serif headings).
@apps/web/components/shared/EmptyState.tsx

# Existing read-query helper style.
@apps/web/lib/db/queries/insights.ts

# AuthenticatedUser has .email.
@apps/web/lib/auth/get-user.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: kiwiDevRuns table + hand-written migration 0015 (file only, NOT applied)</name>
  <files>apps/web/lib/db/schema.ts, apps/web/drizzle/0015_kiwi_dev_runs.sql</files>
  <action>
Add the kiwiDevRuns table to apps/web/lib/db/schema.ts, mirroring the cronRuns table
style (it lives among the top-level tables near cronRuns, ~line 441). Map it to the
"kiwi_dev_runs" Postgres table with these columns:
- id: uuid primary key, defaultRandom().
- userId: uuid "user_id", notNull(), references(() => users.id, { onDelete: "cascade" })
  (same users table the cron resolves the owner from).
- runDate: date "run_date", notNull().
- startedAt: timestamp "started_at" withTimezone, nullable.
- finishedAt: timestamp "finished_at" withTimezone, nullable.
- status: text "status", nullable (values like "ok" | "partial" | "failed", not enum-constrained).
- issuesAttempted: integer "issues_attempted", notNull(), default(0).
- issuesDone: integer "issues_done", notNull(), default(0).
- issuesSkipped: integer "issues_skipped", notNull(), default(0).
- issuesFailed: integer "issues_failed", notNull(), default(0).
- items: jsonb "items", notNull(), default(sql`'[]'::jsonb`), typed via .$type<DevRunItem[]>()
  where DevRunItem is the shared type. Import DevRunItem from the query helper created in
  Task 3 (or define DevRunItem in schema.ts and re-export from the query helper). Pick ONE
  home for DevRunItem and import it in the other file so the type is single-sourced; do NOT
  duplicate the shape. Each item is { issueNumber: number, title: string, status: "done" |
  "skipped" | "failed" | "timed-out", branch: string | null, branchUrl: string | null,
  commitCount: number, note: string | null }.
- createdAt: timestamp "created_at" withTimezone, defaultNow(), notNull().
Table config callback: a uniqueIndex named "kiwi_dev_runs_user_date_uniq" on (t.userId, t.runDate).
Add a short header comment in the cronRuns comment style explaining the once-per-day upsert
intent. Match existing import usage (jsonb, uniqueIndex, date, integer are already imported).

Then hand-write apps/web/drizzle/0015_kiwi_dev_runs.sql, matching the 0010-0014 style.
Additive only:
- CREATE TABLE IF NOT EXISTS "kiwi_dev_runs" with columns mirroring the schema (id uuid pk
  default gen_random_uuid() not null; user_id uuid not null; run_date date not null;
  started_at timestamp with time zone; finished_at timestamp with time zone; status text;
  issues_attempted integer not null default 0; issues_done integer not null default 0;
  issues_skipped integer not null default 0; issues_failed integer not null default 0;
  items jsonb not null default '[]'::jsonb; created_at timestamp with time zone default now() not null).
- CREATE UNIQUE INDEX IF NOT EXISTS "kiwi_dev_runs_user_date_uniq" ON "kiwi_dev_runs" ("user_id","run_date").
Add a top-of-file comment matching 0014's note: hand-written because the drizzle meta
snapshots are frozen at 0009, so drizzle-kit generate would emit a wrong diff.

CRITICAL: do NOT run drizzle-kit generate, drizzle-kit migrate, drizzle-kit push, or any
command that applies the migration to a database. This task produces files only. The
orchestrator applies 0015 to prod separately.

No em dashes or en dashes anywhere in the schema comment or migration comment.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "schema\|dev-runs\|kiwiDevRuns" | grep -v '^#' | grep -c . | grep -qx 0 && echo SCHEMA_TYPECHECK_OK</automated>
    grep -n "kiwiDevRuns" apps/web/lib/db/schema.ts returns the new table; grep -n "kiwi_dev_runs_user_date_uniq" apps/web/drizzle/0015_kiwi_dev_runs.sql returns the unique index; confirm no "—" or "–" characters in either file. Confirm NO drizzle-kit command was run and the migration is NOT applied to any DB.
  </verify>
  <done>
kiwiDevRuns table exists in schema.ts with all listed columns and the unique index on
(user_id, run_date); 0015_kiwi_dev_runs.sql exists as an additive, idempotent (IF NOT
EXISTS) hand-written migration in the 0014 style; the migration has NOT been applied to any
database by the executor (file only); TypeScript compiles; no em/en dashes.
  </done>
</task>

<task type="auto">
  <name>Task 2: token-gated POST /api/dev-runs ingest endpoint</name>
  <files>apps/web/app/api/dev-runs/route.ts</files>
  <action>
Create apps/web/app/api/dev-runs/route.ts. Set `export const runtime = "nodejs"` and
`export const dynamic = "force-dynamic"`. Export only POST; for any other method export a
handler (or guard inside POST) returning 405 { error: "method not allowed" } so non-POST is
rejected.

Auth MUST mirror the captures-to-issues cron route EXACTLY (read that file in context),
substituting the secret name:
- Read process.env.DEV_RUN_INGEST_SECRET. If unset, fail closed: return
  NextResponse.json({ error: "DEV_RUN_INGEST_SECRET not configured on server" }, { status: 500 }).
  A missing secret NEVER means open.
- Read the "authorization" header (default ""), build expected = `Bearer ${secret}`.
- Compare with node:crypto timingSafeEqual over Buffers, length-guarded first (timingSafeEqual
  throws on unequal lengths), exactly as the cron does. On mismatch return 401 { error:
  "unauthorized" }. This auth block runs BEFORE any DB read or write and before parsing the body.
- After auth passes, resolve the owner: read process.env.GITHUB_ISSUE_USER_EMAIL. If unset,
  return 500 { error: "GITHUB_ISSUE_USER_EMAIL not configured on server" } and write nothing.
  Look up users by eq(users.email, ownerEmail) limit 1; if no match return 500 { error:
  "owner user not found" } and write nothing. The owner email is NEVER hardcoded.

Then Zod-validate the JSON body (mirror the Zod style in issue-specer.ts):
- runDate: string matching /^\d{4}-\d{2}-\d{2}$/ (YYYY-MM-DD).
- startedAt: optional ISO datetime string (nullable/optional).
- finishedAt: optional ISO datetime string (nullable/optional).
- status: optional string.
- items: array of objects { issueNumber: number, title: string, status: enum "done" |
  "skipped" | "failed" | "timed-out", branch: string | null (optional, default null),
  branchUrl: string | null (optional, default null), commitCount: number (default 0),
  note: string | null (optional, default null) }. Reuse the shared DevRunItem shape from the
  query helper / schema (import it; do not redefine the field set in prose). On parse failure
  return 400 { error: "invalid body", details } (zod .flatten() or .issues), writing nothing.

Derive counts from items when the caller omits them: issuesDone = items where status==="done";
issuesSkipped = status==="skipped"; issuesFailed = status==="failed" || status==="timed-out";
issuesAttempted = items.length. If the body also carries explicit counts you may accept them,
but the derived-from-items path MUST work when counts are absent.

Upsert into kiwiDevRuns scoped to the resolved owner userId:
db.insert(kiwiDevRuns).values({ userId: ownerId, runDate, startedAt, finishedAt, status,
issuesAttempted, issuesDone, issuesSkipped, issuesFailed, items })
.onConflictDoUpdate({ target: [kiwiDevRuns.userId, kiwiDevRuns.runDate], set: { startedAt,
finishedAt, status, issuesAttempted, issuesDone, issuesSkipped, issuesFailed, items } })
.returning({ id: kiwiDevRuns.id }). Use sql-safe conversion for timestamp inputs (the
postgres-js driver accepts Date or ISO string for timestamptz; pass through validated values
or null). Return NextResponse.json({ ok: true, id }).

This token-gated upsert is the ONLY mutation path for kiwi_dev_runs rows. Do not add any
other write site. Add a short header comment documenting the single-write-path invariant and
the two-layer ordering (token auth, then owner resolution, then validation, then upsert).

No em dashes or en dashes anywhere.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "dev-runs/route" | grep -v '^#' | grep -c . | grep -qx 0 && echo ROUTE_TYPECHECK_OK</automated>
    grep -n "timingSafeEqual" apps/web/app/api/dev-runs/route.ts (auth mirrors cron); grep -n "onConflictDoUpdate" apps/web/app/api/dev-runs/route.ts (upsert present); grep -n "DEV_RUN_INGEST_SECRET" apps/web/app/api/dev-runs/route.ts; grep -n 'runtime = "nodejs"' apps/web/app/api/dev-runs/route.ts. Confirm the 401-before-DB ordering by reading the handler top-to-bottom (auth block precedes any db. call). Confirm no "—"/"–".
  </automated>
  </verify>
  <done>
POST /api/dev-runs exists with runtime "nodejs" and dynamic force-dynamic; non-POST returns
405; missing DEV_RUN_INGEST_SECRET fails closed (500/401, never ok); wrong/missing/malformed
bearer returns 401 before any DB access; owner is resolved from GITHUB_ISSUE_USER_EMAIL via
users.email (config errors return 500 and write nothing); body is Zod-validated; counts are
derived from items when absent; a valid request upserts one row per (userId, runDate) via
onConflictDoUpdate and returns { ok: true, id }; this is the only write path; TypeScript
compiles; no em/en dashes.
  </done>
</task>

<task type="auto">
  <name>Task 3: getRecentDevRuns read query + shared DevRunItem/DevRun types</name>
  <files>apps/web/lib/db/queries/dev-runs.ts</files>
  <action>
Create apps/web/lib/db/queries/dev-runs.ts in the style of queries/insights.ts.

Export the shared types (single source of truth used by the schema items column, the
endpoint validator, and the UI):
- export type DevRunItem = { issueNumber: number; title: string; status: "done" | "skipped"
  | "failed" | "timed-out"; branch: string | null; branchUrl: string | null; commitCount:
  number; note: string | null }.
- export type DevRun = { id: string; userId: string; runDate: string; startedAt: Date | null;
  finishedAt: Date | null; status: string | null; issuesAttempted: number; issuesDone:
  number; issuesSkipped: number; issuesFailed: number; items: DevRunItem[]; createdAt: Date }.
  (Match the column nullability from Task 1; runDate is a date column, so it comes back as a
  string from the postgres-js driver.)

Export async function getRecentDevRuns(userId: string, limit = 14): Promise<DevRun[]>. Use
db.select(...).from(kiwiDevRuns).where(eq(kiwiDevRuns.userId, userId))
.orderBy(desc(kiwiDevRuns.runDate)).limit(limit). Import { desc, eq } from "drizzle-orm" and
kiwiDevRuns from "@/lib/db/schema". Cast/select items as DevRunItem[] (the jsonb .$type from
Task 1 should already yield DevRunItem[]; if a cast is needed keep it explicit and typed, no
`any`).

DECISION ON DevRunItem home: if Task 1 defined DevRunItem in schema.ts, re-export it here
(export type { DevRunItem } from "@/lib/db/schema") so consumers can import from this query
module. If Task 1 imported DevRunItem from here, define it here. Either way, exactly one
definition exists and this file exports it. No em dashes or en dashes.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "queries/dev-runs" | grep -v '^#' | grep -c . | grep -qx 0 && echo QUERY_TYPECHECK_OK</automated>
    grep -n "export.*getRecentDevRuns" apps/web/lib/db/queries/dev-runs.ts; grep -n "DevRunItem\|DevRun" apps/web/lib/db/queries/dev-runs.ts (both types exported); grep -n "orderBy(desc" apps/web/lib/db/queries/dev-runs.ts. Confirm no "—"/"–".
  </verify>
  <done>
getRecentDevRuns(userId, limit=14) exists, ordered by runDate desc, returning DevRun[];
DevRunItem and DevRun are exported and single-sourced (no duplicate shape definition across
schema/endpoint/UI); TypeScript compiles with no `any` on the items mapping; no em/en dashes.
  </done>
</task>

<task type="auto">
  <name>Task 4: owner-gated DEVELOPMENT tab (page wiring + InsightsTabs + DevelopmentTabPanel)</name>
  <files>apps/web/app/(app)/insights/page.tsx, apps/web/components/insights/InsightsTabs.tsx, apps/web/components/insights/DevelopmentTabPanel.tsx</files>
  <action>
Three edits. The owner gate for reads/visibility is user.email === process.env.GITHUB_ISSUE_USER_EMAIL.

1) apps/web/app/(app)/insights/page.tsx:
- Compute `const isDevOwner = user.email === process.env.GITHUB_ISSUE_USER_EMAIL;` (after
  requireOnboarded()). Guard against an unset env var: if GITHUB_ISSUE_USER_EMAIL is
  undefined, isDevOwner must be false (an undefined === user.email comparison is already
  false, which is correct; do not loosen it).
- Only when isDevOwner, fetch getRecentDevRuns(user.id) (import from
  "@/lib/db/queries/dev-runs"). Keep it off the critical path for non-owners: either add it
  conditionally to the Promise.all or fetch it in a separate awaited call guarded by
  isDevOwner. When not owner, do not call getRecentDevRuns at all.
- Extend the local Tab union to include "development". Allow initialTab "development" ONLY
  when isDevOwner; otherwise if the ?tab param is "development" for a non-owner, fall back to
  "life". (Update the existing `tab === ...` initialTab resolver accordingly.)
- Pass `development={isDevOwner ? { runs } : null}` to InsightsTabs (runs is the
  getRecentDevRuns result; null when not owner).

2) apps/web/components/insights/InsightsTabs.tsx:
- Import DevRun type from "@/lib/db/queries/dev-runs" and the new DevelopmentTabPanel.
- Extend the Tab union: type Tab = "life" | "habits" | "jarvis" | "development".
- Add an optional prop: development?: { runs: DevRun[] } | null.
- Render the DEVELOPMENT TabButton ONLY when `development` is truthy (non-owners never see
  the tab). Place it after the JARVIS TabButton, label "Development", same TabButton
  component.
- Add a panel branch for tab === "development" that renders <DevelopmentTabPanel
  runs={development.runs} />. Guard: if tab somehow === "development" while development is
  null (e.g. stale state), fall back to rendering the life panel. The simplest correct
  approach is to coerce the effective tab at render: if tab === "development" && !development,
  treat as "life".
- Do not change the life/habits/jarvis behavior.

3) NEW apps/web/components/insights/DevelopmentTabPanel.tsx ("use client"):
- Props: { runs: DevRun[] } (import DevRun from "@/lib/db/queries/dev-runs").
- If runs is empty, render <EmptyState heading="No auto-dev runs yet." body="..."/> (import
  from "@/components/shared/EmptyState"; write a short brand-voice body sentence with no
  em/en dashes).
- Otherwise list runs newest-first (they already arrive runDate desc; do not re-sort unless
  needed). Per run: a header row with the run date and the counts (done / skipped / failed),
  using the insights tokens (var(--ink) headings, var(--ink-muted) secondary, var(--surface)
  / var(--edge) for the card/border) and the font-mono small-caps label style used by
  TabButton (font-mono text-[11px] uppercase tracking-[0.06em]) for the count labels;
  serif (font-serif) for the run-date heading.
- Per item row: a small status badge (done / skipped / failed / timed-out) with a subtle
  color treatment per status (keep it token-driven and restrained, matching the JARVIS x
  Notion aesthetic; avoid loud colors), the text "#<issueNumber> <title>", and when branch
  is present a link to the branch. Link href = branchUrl ?? `https://github.com/filippo-
  fonseca/hyperpolymath-v2/tree/${branch}`; open in a new tab (target="_blank"
  rel="noopener noreferrer"). When branch is null, render no link.
- Keep the component presentational (no data fetching). Match LifeTabPanel / EmptyState
  spacing and typography conventions. No em dashes or en dashes anywhere in copy, labels, or
  comments.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "insights/page|InsightsTabs|DevelopmentTabPanel" | grep -v '^#' | grep -c . | grep -qx 0 && echo UI_TYPECHECK_OK</automated>
    grep -n "isDevOwner" apps/web/app/(app)/insights/page.tsx (owner gate present); grep -n "getRecentDevRuns" apps/web/app/(app)/insights/page.tsx (read gated); grep -n '"development"' apps/web/components/insights/InsightsTabs.tsx (tab in union); grep -n "DevelopmentTabPanel" apps/web/components/insights/InsightsTabs.tsx; grep -n "EmptyState" apps/web/components/insights/DevelopmentTabPanel.tsx; grep -n "filippo-fonseca/hyperpolymath-v2/tree" apps/web/components/insights/DevelopmentTabPanel.tsx (branch fallback link). Confirm the DEVELOPMENT TabButton + panel render ONLY when development is truthy by reading the JSX. Confirm no "—"/"–" in any of the three files.
  </automated>
  </verify>
  <done>
isDevOwner is computed as user.email === GITHUB_ISSUE_USER_EMAIL (false when env unset);
getRecentDevRuns runs only for the owner; the DEVELOPMENT TabButton and panel appear only
when the development prop is truthy (non-owners never see them); a "development" tab request
by a non-owner falls back to "life", and a development===null + tab==="development" state
also falls back to life; DevelopmentTabPanel lists runs newest-first with counts, per-item
status badges, "#<issueNumber> <title>", and branch links (branchUrl or the github tree
fallback) opening in a new tab; empty state uses EmptyState; styling matches insights tokens
and TabButton small-caps labels; TypeScript compiles; no em/en dashes.
  </done>
</task>

<task type="auto">
  <name>Task 5: env example (DEV_RUN_INGEST_SECRET, GITHUB_ISSUE_USER_EMAIL)</name>
  <files>apps/web/.env.local.example</files>
  <action>
Add DEV_RUN_INGEST_SECRET to apps/web/.env.local.example with a one-line comment explaining
the local Kiwi auto-dev worker sends it as the Bearer token to /api/dev-runs (e.g. generate
with openssl rand -hex 32; must match the value set in Vercel project env). Place it near the
other secrets (e.g. close to CRON_SECRET / GITHUB_ISSUE_* entries) for discoverability.

Confirm GITHUB_ISSUE_USER_EMAIL is present (it should already exist from the captures-to-
issues cron work). If it is missing, add it with a one-line comment (owner's users.email;
resolves the target user for both the cron and the dev-runs ingest endpoint).

No em dashes or en dashes in the comments.

IMPORTANT: apps/web/.env.local.example may be permission-blocked for edits in this
environment (Bash reads of it were already denied during planning). If the Write/Edit tool
cannot modify the file, do NOT silently skip: surface it clearly in the SUMMARY under a
"Could not edit" note with the exact lines that should be added so the orchestrator/owner can
add them manually. Do not invent a workaround that writes the secret value anywhere else.
  </action>
  <verify>
    grep -n "DEV_RUN_INGEST_SECRET" apps/web/.env.local.example returns the new key with its comment; grep -n "GITHUB_ISSUE_USER_EMAIL" apps/web/.env.local.example confirms the owner-email key is present; confirm no "—"/"–" in the added lines. If the file could not be edited, the SUMMARY explicitly documents this with the exact lines to add (no silent skip).
  </verify>
  <done>
DEV_RUN_INGEST_SECRET is documented in .env.local.example with a one-line comment, and
GITHUB_ISSUE_USER_EMAIL is confirmed present (added if it was missing); OR, if the file is
permission-blocked, the SUMMARY clearly records that it could not be edited and lists the
exact lines to add. No secret values are written anywhere else; no em/en dashes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local worker -> /api/dev-runs | Untrusted network input crosses here; only the bearer token authorizes a write. |
| browser (any signed-in user) -> /insights | Authenticated but non-owner users must not see or fetch dev-run data. |
| server env -> DB owner scoping | The owner userId is resolved from env (GITHUB_ISSUE_USER_EMAIL), never from request body. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lkl-01 | Spoofing | POST /api/dev-runs | mitigate | Constant-time bearer check (node:crypto timingSafeEqual, length-guarded) mirrored from the cron; 401 before any DB access. |
| T-lkl-02 | Elevation of Privilege | /insights DEVELOPMENT tab | mitigate | Tab visibility and getRecentDevRuns read are both gated on user.email === GITHUB_ISSUE_USER_EMAIL; non-owners never fetch or render dev-run data. |
| T-lkl-03 | Tampering | dev-run row owner scoping | mitigate | userId comes from env-resolved owner lookup, never from the request body; upsert target is (userId, runDate). |
| T-lkl-04 | Information Disclosure | misconfigured secret | mitigate | Missing DEV_RUN_INGEST_SECRET fails closed (500/401, never ok); missing/unmatched GITHUB_ISSUE_USER_EMAIL returns 500 and writes nothing. |
| T-lkl-05 | Tampering | malformed ingest body | mitigate | Zod-validate runDate format, status enum, and items shape; 400 on parse failure before the upsert. |
| T-lkl-06 | Denial of Service | unbounded items array | accept | Single trusted local worker; low-value internal surface. If abuse appears, add a max-items cap and rate limit later. |
| T-lkl-SC | Tampering | npm/pip/cargo installs | accept | No new dependencies introduced (Drizzle, Zod, next/server already present); no package install tasks in this plan. |
</threat_model>

<verification>
- TypeScript compiles across all touched files: `cd apps/web && npx tsc --noEmit`.
- Endpoint auth is byte-for-byte the cron pattern (timingSafeEqual, length guard, fail-closed,
  401 before DB), with the secret name swapped to DEV_RUN_INGEST_SECRET.
- Migration 0015 exists and is additive/idempotent, and was NOT applied to any DB by the executor.
- kiwi_dev_runs has a UNIQUE (user_id, run_date) so the daily POST upserts one row per day.
- The DEVELOPMENT tab and its data are owner-only (email gate) and the write path is token-only.
- No em dashes or en dashes in any code, comment, copy, or this plan.
</verification>

<success_criteria>
- kiwiDevRuns table + 0015 migration (file only, NOT applied) exist and typecheck.
- POST /api/dev-runs upserts one row per (owner userId, runDate); rejects non-POST (405),
  unauthorized (401 before DB), and invalid bodies (400); fails closed on missing secret.
- getRecentDevRuns(userId, limit=14) returns DevRun[] newest-first with single-sourced
  DevRunItem/DevRun types.
- Owner sees a DEVELOPMENT tab listing runs with counts, status badges, issue refs, and
  branch links; non-owners see nothing and trigger no dev-run fetch.
- DEV_RUN_INGEST_SECRET documented in .env.local.example (or the SUMMARY records it could not
  be edited, with the exact lines), GITHUB_ISSUE_USER_EMAIL confirmed present.
- Executor commits on the current feat/dev-runs-development-tab branch; no push, no PR, no DB
  migration applied (orchestrator handles those).
</success_criteria>

<output>
Create `.planning/quick/260615-lkl-development-tab-on-insights-with-dev-run/260615-lkl-SUMMARY.md` when done.
</output>
