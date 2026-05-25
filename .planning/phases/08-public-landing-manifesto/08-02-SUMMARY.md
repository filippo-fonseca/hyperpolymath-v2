---
phase: 08-public-landing-manifesto
plan: 02
subsystem: landing-waitlist-infra
tags: [server-action, drizzle, supabase, rls, monorepo, vercel, next-config, github-api, env-config]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: Drizzle schema infrastructure (lib/db/schema.ts, drizzle/meta journal, supabase/migrations layout)
  - phase: 05-jarvis
    provides: Anonymous Server Action pattern reference (apps/web/app/actions/* shape)
provides:
  - waitlist_data_layer (Drizzle waitlist table + 0008 migration + 0012 RLS migration + joinWaitlist Server Action)
  - monorepo_vercel_file_tracing (outputFileTracingRoot + outputFileTracingIncludes for .planning/ROADMAP.md)
  - github_token_env_contract (GITHUB_TOKEN documented in .env.example with rationale + graceful-degradation note)
affects:
  - 08-05 (WaitlistForm imports joinWaitlist from @/app/actions/waitlist)
  - 08-05 (BuildLog Server Component fs.readFile of .planning/ROADMAP.md on Vercel + GitHub commits feed)

# Tech tracking
tech-stack:
  added: []  # zero new deps — pure plumbing
  patterns:
    - "Anonymous Server Action (no getClaims) — first deviation from the userId-scoped pattern"
    - "Honeypot + per-IP rate limit (in-memory Map, sha256-hashed IP) — bot defense at the action layer, not SQL"
    - "Drizzle onConflictDoNothing({ target: waitlist.email }) — idempotent re-submit, no duplicate, no leakage"
    - "Defense-in-depth RLS: enabled + anon/authenticated INSERT-only with WITH CHECK (true), no SELECT/UPDATE/DELETE — real boundary is the action"
    - "Vercel monorepo file tracing: outputFileTracingRoot rebased to workspace root + outputFileTracingIncludes per route key"
    - "Environment contract documentation pattern: env var declared with usage rationale + graceful-degradation note + generation URL"

key-files:
  created:
    - apps/web/drizzle/0008_waitlist.sql
    - apps/web/drizzle/meta/0008_snapshot.json
    - apps/web/supabase/migrations/0012_waitlist.sql
    - apps/web/app/actions/waitlist.ts
  modified:
    - apps/web/lib/db/schema.ts (appended waitlist pgTable + Pitfall-5 doc block)
    - apps/web/drizzle/meta/_journal.json (registered 0008 tag)
    - apps/web/next.config.ts (added outputFileTracingRoot + outputFileTracingIncludes)
    - .env.example (added Phase 8 GITHUB_TOKEN block + cleaned up stale apps/web/.env.example duplicate)

key-decisions:
  - "Anonymous Server Action over API route — first-party form, no need for public REST surface; reduces attack surface and inherits Next 16 Server Action protections"
  - "Real security boundary is the Server Action (Zod + honeypot + IP rate limit + ON CONFLICT), not RLS — Drizzle pooler connects as DB-owner role and bypasses RLS entirely (RESEARCH §Pitfall 5)"
  - "RLS policies remain as defense-in-depth for the hypothetical browser-side supabase-js write path; load-bearing security-model comment block in 0012 migration plus mirror comment in schema.ts"
  - "Hashed IP (sha256 first 16 chars) for triage — never raw IP per privacy posture"
  - "onConflictDoNothing on email — duplicate submit returns success path silently (no leakage, no error)"
  - "outputFileTracingRoot pinned to repo root via path.join(__dirname, '../../') so .planning/ROADMAP.md ships in the serverless bundle for Plan 08-05's BuildLog Server Component"
  - "GITHUB_TOKEN documented with explicit graceful-degradation contract — BuildLog renders 'Commit feed unavailable' if absent, Block 1 (ROADMAP shipping line) still works"
  - "Canonical .env.example lives at repo root, not apps/web/ — stale apps/web/.env.example deleted to remove confusion"

patterns-established:
  - "First non-userId-scoped table — schema.ts now mixes both shapes; the comment block on `waitlist` documents the deviation so future contributors don't assume userId is universal"
  - "Drizzle-kit migration tag renaming workflow — auto-generated 0007_giant_harpoon renamed to 0008_waitlist for legibility, _journal.json + snapshot updated to match"
  - "Pattern for env vars that the app degrades gracefully without — the doc block in .env.example tells the deployer what breaks vs what still works when absent"

requirements-completed:
  - LAND-WAITLIST
  - LAND-ROADMAP-FS
  - LAND-GH-ENV

# Metrics
duration: pre-implemented (verification-only session)
completed: 2026-05-25
---

# Phase 8 Plan 02: Waitlist Server Action + Vercel/Supabase Hardening Summary

**Anonymous waitlist Server Action (Zod + honeypot + per-IP rate limit + Drizzle ON CONFLICT DO NOTHING) backed by a first non-userId Drizzle table + defense-in-depth RLS migration, plus `next.config.ts` `outputFileTracingRoot`/`outputFileTracingIncludes` so `.planning/ROADMAP.md` ships in the Vercel serverless bundle and `.env.example` documents `GITHUB_TOKEN` for Plan 08-05's BuildLog.**

## Performance

- **Duration:** Verification-only session (implementation completed in a prior session across three commits)
- **Started:** 2026-05-25T14:10:52Z (first task commit)
- **Completed:** 2026-05-25T14:24:40Z (final task commit)
- **Tasks:** 3 (all complete)
- **Files modified/created:** 8 (4 created, 4 modified)

## Accomplishments

- **Waitlist data layer end-to-end** — Drizzle `waitlist` table (id / email-unique / note / submitted_ip / created_at, no userId), Drizzle migration `0008_waitlist.sql`, raw Supabase RLS migration `0012_waitlist.sql`, and `joinWaitlist` Server Action with full defense (Zod bounded email/note + honeypot `website` field + 5/hr per-hashed-IP rate limit + idempotent ON CONFLICT). Plan 08-05's WaitlistForm can `import { joinWaitlist } from '@/app/actions/waitlist'` with zero further setup.
- **Vercel monorepo file tracing** — `next.config.ts` now rebases `outputFileTracingRoot` to the pnpm workspace root and includes `../../.planning/ROADMAP.md` for the `/` route. This unblocks Plan 08-05's BuildLog Server Component to `fs.readFile` ROADMAP.md from a deployed Vercel serverless function (otherwise: ENOENT). Existing `reactStrictMode` and `transpilePackages: ["@hyperpolymath/jarvis-core"]` preserved.
- **GitHub token environment contract** — `.env.example` documents `GITHUB_TOKEN` with the full rationale: 60 req/hr unauthenticated → 5,000 req/hr authenticated, ISR collapses traffic to ~6 calls/hr/region, graceful-degradation contract (BuildLog block 2 shows "Commit feed unavailable" if absent while block 1 still works from ROADMAP.md). Stale `apps/web/.env.example` duplicate removed.

## Task Commits

Each task was committed atomically (all in the prior session):

1. **Task 1: Drizzle schema + migration** — `82ea366` (feat: add waitlist Drizzle schema + migration)
2. **Task 2: RLS migration + Server Action** — `b41a990` (feat: waitlist Server Action + RLS migration (defense-in-depth))
3. **Task 3: next.config.ts + .env.example** — `14536d2` (feat: wire monorepo file tracing + GITHUB_TOKEN env doc)

**Plan metadata (this session):** committed alongside SUMMARY.md + STATE.md + ROADMAP.md updates.

## Files Created/Modified

**Created:**
- `apps/web/drizzle/0008_waitlist.sql` — `CREATE TABLE waitlist` + `CREATE UNIQUE INDEX waitlist_email_uniq` (drizzle-kit generated, renamed from auto-tag `0007_giant_harpoon` to `0008_waitlist` for legibility)
- `apps/web/drizzle/meta/0008_snapshot.json` — Drizzle migration snapshot for the new tag
- `apps/web/supabase/migrations/0012_waitlist.sql` — `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY waitlist_anon_insert FOR INSERT TO anon WITH CHECK (true)` + `CREATE POLICY waitlist_authenticated_insert FOR INSERT TO authenticated WITH CHECK (true)`. No SELECT/UPDATE/DELETE policies. Load-bearing security-model comment block names the Server Action as the real security boundary.
- `apps/web/app/actions/waitlist.ts` — `"use server"` module exporting `joinWaitlist(input: unknown): Promise<JoinWaitlistResult>`. Zod schema (`email` lowercased max 320, `note` trimmed max 280 optional, `website` honeypot max 0), sha256-hashed `await headers()` IP (Next 16 async), in-memory `Map<string, number[]>` rate limiter (5/hr), `db.insert(waitlist).values(...).onConflictDoNothing({ target: waitlist.email })`, canonical error string `"Couldn't reach the list. Try again, or email filippo directly."` from UI-SPEC §9.

**Modified:**
- `apps/web/lib/db/schema.ts` — appended the `waitlist` pgTable with a load-bearing comment block flagging Pitfall 5 (Drizzle pooler bypasses RLS, real security is in the Server Action). First table in the project without a `userId` column.
- `apps/web/drizzle/meta/_journal.json` — registered the `0008_waitlist` tag.
- `apps/web/next.config.ts` — added `import path from "node:path"`, `outputFileTracingRoot: path.join(__dirname, "../../")`, and `outputFileTracingIncludes: { "/": ["../../.planning/ROADMAP.md"] }`. `reactStrictMode` and `transpilePackages` preserved verbatim.
- `.env.example` — added the Phase 8 PUBLIC LANDING block at the bottom with the full `GITHUB_TOKEN` rationale + generation URL + failure-mode contract. Deleted the stale duplicate at `apps/web/.env.example` (root is canonical).

## Decisions Made

All decisions were locked during the prior implementation session and are documented in the frontmatter `key-decisions`. The two load-bearing ones worth re-stating here:

1. **Server Action over API route, no `getClaims`** — the waitlist endpoint is intentionally anonymous (it's the public landing's email capture). The Server Action gets Next 16's CSRF + same-origin protections for free, has no public REST surface to fuzz, and the contract is "form action only".
2. **RLS is defense-in-depth, not the real boundary** — Drizzle's `postgres` driver connects to Supabase via the pooler as the DB-owner role, which bypasses RLS entirely. The policies in `0012_waitlist.sql` only fire for the hypothetical case where someone calls the `waitlist` table directly via supabase-js from a browser. The real security stack is in the action layer: Zod + honeypot + IP rate limit + ON CONFLICT idempotency. This nuance is documented in TWO places (schema.ts comment block + migration comment block) so a future contributor doesn't strip the action-layer defenses thinking RLS handles it.

## Deviations from Plan

None — plan executed exactly as written in the prior session. This session's role was strict verification of every `must_haves.truth` against the working tree; zero new code changes were required.

## Verification Results

All 6 `must_haves.truths` verified against HEAD (`14536d2`) in this session:

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Anonymous visitor can POST email via Server Action and a row appears in `public.waitlist` (D-12) | PASS | `joinWaitlist` in `apps/web/app/actions/waitlist.ts` calls `db.insert(waitlist).values({ email, note, submittedIp }).onConflictDoNothing(...)` |
| 2 | Duplicate email submission returns success path (no row dupe, no error) via `ON CONFLICT (email) DO NOTHING` (D-12 idempotency) | PASS | `onConflictDoNothing({ target: waitlist.email })` on line 87 of waitlist.ts; returns `{ success: true }` |
| 3 | Honeypot + per-IP rate limit (5/hr) block bots in Server Action layer | PASS | Honeypot Zod field `website: z.string().max(0).optional()` + silent-success check on `parsed.data.website.length > 0`; `ipBucket` Map keyed by sha256-hashed IP with RATE_LIMIT=5 / RATE_WINDOW_MS=1hr |
| 4 | RLS policy `FOR INSERT TO anon WITH CHECK (true)` exists as defense-in-depth (RESEARCH Pitfall 5) | PASS | `0012_waitlist.sql` ENABLES RLS + `CREATE POLICY "waitlist_anon_insert" ON public.waitlist FOR INSERT TO anon WITH CHECK (true)` + sister policy for authenticated; intentionally no SELECT/UPDATE/DELETE |
| 5 | `next.config.ts` ships `.planning/ROADMAP.md` into the serverless bundle via `outputFileTracingRoot` + `outputFileTracingIncludes` (D-09) | PASS | `next.config.ts` lines 19-23: `outputFileTracingRoot: path.join(__dirname, "../../")` + `outputFileTracingIncludes: { "/": ["../../.planning/ROADMAP.md"] }` |
| 6 | `.env.example` documents `GITHUB_TOKEN` with usage rationale (D-09 / Pitfall 4) | PASS | `.env.example` lines 50-70: Phase 8 PUBLIC LANDING block with `GITHUB_TOKEN=` + rate-limit math + graceful-degradation failure-mode contract |

All `must_haves.artifacts` also confirmed present with the documented marker strings (`export const waitlist`, `CREATE TABLE`, `ENABLE ROW LEVEL SECURITY`, `joinWaitlist`, `outputFileTracingIncludes`, `GITHUB_TOKEN`).

## Issues Encountered

None — verification session encountered zero deltas between plan and repo state.

## User Setup Required

None - no external service configuration required by this plan. (The `GITHUB_TOKEN` env var WILL need a real value in Vercel's dashboard for Plan 08-05's BuildLog to use the authenticated 5,000/hr GitHub rate, but absence is gracefully handled — this plan only documents the contract; the deployer wires the value when Plan 08-05 ships.)

## Known Stubs

None. Every artifact is fully wired:
- Waitlist signup path: form (Plan 08-05) → `joinWaitlist` Server Action → Drizzle insert into `public.waitlist` with idempotency + rate limit + honeypot.
- File tracing config: real `path.join`, real includes array; the only consumer (BuildLog) lands in Plan 08-05 and the config is ready.
- `GITHUB_TOKEN` is an env contract slot — its consumer (BuildLog's GitHub fetch) lands in Plan 08-05. Absence is intentional and documented; not a stub.

## Self-Check: PASSED

- FOUND: `apps/web/lib/db/schema.ts` (contains `export const waitlist`)
- FOUND: `apps/web/drizzle/0008_waitlist.sql` (contains `CREATE TABLE`)
- FOUND: `apps/web/drizzle/meta/0008_snapshot.json`
- FOUND: `apps/web/supabase/migrations/0012_waitlist.sql` (contains `ENABLE ROW LEVEL SECURITY` + `FOR INSERT TO anon`)
- FOUND: `apps/web/app/actions/waitlist.ts` (contains `"use server"`, `export async function joinWaitlist`, `onConflictDoNothing`, honeypot, rate limit)
- FOUND: `apps/web/next.config.ts` (contains `outputFileTracingRoot` + `outputFileTracingIncludes` + preserved `transpilePackages` + `reactStrictMode`)
- FOUND: `.env.example` (contains `# PHASE 8 — PUBLIC LANDING (LAND-GH-ENV / D-09)` + `GITHUB_TOKEN=`)
- FOUND commit `82ea366`: feat(08-02): add waitlist Drizzle schema + migration
- FOUND commit `b41a990`: feat(08-02): waitlist Server Action + RLS migration (defense-in-depth)
- FOUND commit `14536d2`: feat(08-02): wire monorepo file tracing + GITHUB_TOKEN env doc

## Next Phase Readiness

- Plan 08-03, 08-04, 08-05, 08-06 are unblocked from a data-layer perspective.
- Plan 08-05 specifically can now wire WaitlistForm (`import { joinWaitlist } from '@/app/actions/waitlist'`) and BuildLog (`fs.readFile('../../.planning/ROADMAP.md')` from a Vercel serverless function + authenticated GitHub fetch when `GITHUB_TOKEN` is set in Vercel).
- No blockers, no concerns.

---
*Phase: 08-public-landing-manifesto*
*Completed: 2026-05-25*
