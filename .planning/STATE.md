---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 04-03-PLAN.md
last_updated: "2026-05-13T00:33:36.473Z"
last_activity: 2026-05-13
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 15
  completed_plans: 14
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Type one sentence into Kiwi → the right action lands in the right place across tasks, captures, and calendar — every time.
**Current focus:** Phase 04 — google-calendar

## Current Position

Phase: 04 (google-calendar) — EXECUTING
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-05-13

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
| Phase 04 P04-01 | 165min | 2 tasks | 18 files |
| Phase 04 P02 | 90min | 3 tasks | 8 files |
| Phase 04 P04-03 | ~140min | 3 tasks | 16 files |

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
- [Phase 04]: [Phase 04 P01]: D-05 revised — token encryption uses app-level AES-256-GCM via node:crypto (12B IV + 16B tag + ciphertext bytea), NOT pgcrypto. Vault requires service_role bypassing RLS; pgcrypto requires per-call key plumbing. AES-GCM keeps key in env var, decryption co-located with getValidGcalToken.
- [Phase 04]: [Phase 04 P01]: Additive-only migration 0007 — Phase 1 plain gcal_* columns retained alongside new encrypted bytea columns; drop deferred to migration 0008 in Plan 04-04 cutover (canonical additive-then-drop pattern for sensitive-column reshape).
- [Phase 04]: [Phase 04 P01]: lib/gcal/ is the single boundary between domain code and googleapis SDK — domain code imports from @/lib/gcal/* only. client/events/calendars/token are the only files allowed to import googleapis directly.
- [Phase 04]: [Phase 04 P02]: OAuth state CSRF via httpOnly cookie + 32-byte hex nonce (10-min TTL, sameSite=lax); cookie deleted in callback regardless of outcome (Pitfall 2)
- [Phase 04]: [Phase 04 P02]: access_type=offline AND prompt=consent both passed to generateAuthUrl — without prompt=consent, reconnect-after-disconnect silently omits refresh_token (Pitfall 1, verified live in browser smoke Test D)
- [Phase 04]: [Phase 04 P02]: disconnectGcal clears DB columns BEFORE oauth2Client.revokeToken (Pitfall 6); ordering enforced by gcal-disconnect.test.ts via invocationCallOrder, not by grep
- [Phase 04]: [Phase 04 P02]: First-connect auto-default to primary calendar happens inside callback (calendarList.list + second db.update in try/catch, non-fatal) — D-09 satisfied at connect time, no Plan 04-04 follow-up needed (m-01 fix)
- [Phase 04]: [Phase 04 P02]: OAuth callback redirects to /calendar?gcal=connected (NOT /settings); GcalConnectionRow handles only error/cancel toasts (denied, invalid_state, no_refresh_token); success toast lives in CalendarClient ships in Plan 04-03 (m-03 fix)
- [Phase 04]: [Phase 04 P02]: disconnectGcal preserves gcal_default_calendar_id + gcal_visible_calendar_ids — same-account reconnect is the common case (D-09/D-10); clearing only happens on different-account detection in Plan 04-04
- [Phase 04]: [Phase 04 P03]: /calendar is force-dynamic + revalidate=0 + hybrid SSR (Server Component pre-fetch + useQuery initialData hydration) — direct-from-gcal on every load satisfies CAL-07; refetchOnWindowFocus:true + 30s staleTime substitutes for Realtime (gcal not in Postgres, D-11)
- [Phase 04]: [Phase 04 P03]: TZDate wrapping in CalendarClient (not eventToDTO mapper) — DTO emits raw ISO strings preserving SSR-serializability; new TZDate(new Date(iso), effectiveTz) at the React layer where tz is resolved (CAL-08 / Pitfall 3)
- [Phase 04]: [Phase 04 P03]: useGcalConnectionStatus hook with single shared cache key ['gcal-connection-status'] (60s staleTime + refetchOnWindowFocus) consumed by PersistentNav badge (M-04) and available to any client component — replaces server-prop-drilling; immediate-update via queryClient.invalidateQueries from disconnectGcal optional (60s ceiling otherwise)
- [Phase 04]: [Phase 04 P03]: Travel-drift detect (M-01/Pitfall 5) surfaces 12s sonner toast with 'Use {detected}' action — does NOT auto-update tz (VPN/airport-wifi false-positive defense); sessionStorage:gcal:tz-drift-dismissed:{saved}:{detected} prevents re-prompt within session

### Pending Todos

None yet.

### Blockers/Concerns

- Open behavior decisions per research SUMMARY.md "Gaps to Address" should be locked in PROJECT.md "Key Decisions" before Phase 5 planning at the latest: date-only vs date-time tasks, "next Friday" semantics, hashtag normalization specifics, default calendar fallback, attendees on events, behavior when Kiwi can't resolve `$project`, Vercel AI SDK vs raw Anthropic SDK, kiwi-core ↔ Server Actions sharing pattern, calendar grid library, Louize licensing path.

## Session Continuity

Last session: 2026-05-13T00:33:24.628Z
Stopped at: Completed 04-03-PLAN.md
Resume file: None
