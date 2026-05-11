---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-02-PLAN.md tasks 1-3; Task 4 (human-verify smoke test) pending
last_updated: "2026-05-11T19:45:35.468Z"
last_activity: 2026-05-11
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 11
  completed_plans: 10
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Type one sentence into Kiwi → the right action lands in the right place across tasks, captures, and calendar — every time.
**Current focus:** Phase 03 — realtime-layer

## Current Position

Phase: 03 (realtime-layer) — EXECUTING
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-05-11

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-foundations P02 | 530349min | 2 tasks | 10 files |
| Phase 02 P04 | Multi-session (walkthrough-driven) | 4 tasks | 18 files |
| Phase 03 P01 | 180min | 4 tasks | 9 files |
| Phase 03-realtime-layer P03 | 12min | 2 tasks | 12 files |
| Phase 03-realtime-layer P02 | 23min | 3 tasks | 23 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: 6 phases derived from research dependency graph (Foundations → Manual CRUD → Realtime → Calendar → Kiwi → Polish). Coarse granularity but 6 is justified — each phase is a coherent unit and Kiwi must come last so its primitives are proven.
- Roadmap: SET-01 (graduation year) shipped in Phase 1 with auth/foundations because Class metadata in Phase 2 depends on it; SET-02/SET-04 (gcal status, default calendar) deferred to Phase 4; SET-03 (theme) deferred to Phase 6.
- Roadmap: TEST-04 (RLS integration test) ships in Phase 1; TEST-01/02/03/05 (parser, contract, adversarial) ship in Phase 5 with the agent.
- Roadmap: RES-05 (`kiwi_events` table) ships in Phase 5 with Kiwi (telemetry from first call); other RES requirements ship in Phase 6.
- [Phase 01-foundations]: drizzle.config.ts uses lib/db/*.ts glob so drizzle-kit picks up pgEnum declarations from enums.ts and emits CREATE TYPE in generated SQL
- [Phase 01-foundations]: supabase/migrations/0000_init_schema.sql strips --> statement-breakpoint markers from drizzle output for Supabase CLI compatibility
- [Phase 03]: [Phase 03-realtime P01]: useTableSubscription uses a module-level Map<`${table}::${userId}`, { channel, refcount }> singleton — two component mounts of the same (table, userId) share one Supabase RealtimeChannel (RT-01 / D-08)
- [Phase 03]: [Phase 03-realtime P01]: single visibilitychange listener lives at QueryProvider; calls notifyVisible(invalidate) walking the refcounted active-table registry — duplicate mounts do not cause duplicate invalidations (RT-03 / D-11)
- [Phase 03]: [Phase 03-realtime P01]: Realtime payload handlers invalidate only — setQueryData forbidden under apps/web/lib/realtime/ (enforced by grep in plan acceptance) (RT-04 / D-09 / CLAUDE.md Critical Pattern 3)
- [Phase 03-realtime-layer]: useTableSubscription extended with alsoInvalidate ReadonlyArray for cross-key fanout (D-10 unlocked) — singleton dedupe holds, extra keys accrue across mounts
- [Phase 03-realtime-layer]: Captures domain uses inline optimistic reducer in CapturesClient (file-disjoint from 03-02's shared module) — same algebra, preserves parallel-wave disjointness
- [Phase 03-realtime-layer]: Auth-gated read Server Actions (getCapturesForCurrentUser, getHashtagsForUserAction) use getClaims() per CLAUDE.md Critical Pattern 1; throw on unauthenticated so TanStack Query surfaces the error
- [Phase 03-realtime-layer]: Plan 03-02 — RT-05 echo dedupe: client generates crypto.randomUUID() before Server Action; schemas accept z.string().uuid().optional(); insert spreads ...(parsed.data.id ? { id: parsed.data.id } : {}); optimistic reducer 'insert' no-ops on echo by id match.
- [Phase 03-realtime-layer]: Plan 03-02 — B1 canonical detail-page pattern: ProjectDetailClient uses tableKey('projects', userId) + select(rows => rows.find(...)) so the same Realtime invalidation drives both sidebar and detail page header.
- [Phase 03-realtime-layer]: Plan 03-02 — M3 ownership split: Sidebar owns areas useOptimistic + useQuery so AreaCreateDialog and SidebarTree (siblings) both dispatch through one prop, no React context for 1-level fan-out.

### Pending Todos

None yet.

### Blockers/Concerns

- Open behavior decisions per research SUMMARY.md "Gaps to Address" should be locked in PROJECT.md "Key Decisions" before Phase 5 planning at the latest: date-only vs date-time tasks, "next Friday" semantics, hashtag normalization specifics, default calendar fallback, attendees on events, behavior when Kiwi can't resolve `$project`, Vercel AI SDK vs raw Anthropic SDK, kiwi-core ↔ Server Actions sharing pattern, calendar grid library, Louize licensing path.

## Session Continuity

Last session: 2026-05-11T19:45:35.464Z
Stopped at: Completed 03-02-PLAN.md tasks 1-3; Task 4 (human-verify smoke test) pending
Resume file: None
