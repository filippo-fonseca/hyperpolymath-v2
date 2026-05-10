# Phase 1: Foundations - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Bootable Next.js 16 + Supabase app deployed to Vercel with Google OAuth working end-to-end, the **full v1 Postgres schema** applied with RLS policies + indexes, encrypted secrets via gitleaks, a one-screen first-run onboarding (graduation year), and a green Vitest harness with the RLS integration test passing.

**In scope:** Repo bootstrap, Supabase + Vercel cloud projects, Google OAuth flow, Drizzle schema + migrations + RLS, route-group auth gate, `/today` placeholder landing, first-run onboarding, sign-in/sign-out pages, settings page (graduation year only), gitleaks + `.env.example`, Vitest 3.x harness, RLS integration test (TEST-04).

**Out of scope (other phases):** Areas/Projects/Tasks/Captures UI (Phase 2), Realtime (Phase 3), Calendar OAuth (Phase 4 — but `users.gcal_*` columns ship in Phase 1 schema), Kiwi (Phase 5), aesthetic polish + theme + Sentry + /insights (Phase 6), GitHub Actions CI (deferred to Phase 6 per user decision).

</domain>

<decisions>
## Implementation Decisions

### Schema scope & modeling
- **D-01:** Model the **FULL v1 schema upfront in Phase 1**. Tables: `users`, `areas`, `projects`, `tasks`, `captures`, `hashtags`, `tasks_projects`, `captures_projects`, `captures_hashtags`, `kiwi_events`. Phase 2-5 only wire UI/Server Actions; no per-phase schema migrations. One coherent schema review now beats churn later.
- **D-02:** Use **Postgres enum types** for `priority` (`'P∞', 'P1', 'P2', 'P3'`) and `task_status` (`'not started', 'up next', 'in progress', 'almost done', 'lesno'`). DB-enforced; clean Drizzle types via `pgEnum`. Adding values requires `ALTER TYPE` migration, but these literals are intentionally fixed.
- **D-03:** **Denormalize `user_id` on every junction table** (`tasks_projects`, `captures_projects`, `captures_hashtags`). RLS policy on each junction is the canonical one-step `(select auth.uid()) = user_id`. No recursive parent lookups. Consistency enforced at the Server Actions boundary (write the junction row's `user_id` from the session's `auth.uid()` — same source of truth as the parent rows).
- **D-04:** **Single `projects` table with `is_class boolean` discriminator** + nullable class metadata columns: `course_code`, `full_class_name`, `instructor`, `semester`, `grade`, `credits`, `distributionals` (text array). CHECK constraint enforces `course_code IS NOT NULL` when `is_class = true`. Matches v1; simpler queries; no joins for class views.

### Repo & deployment
- **D-05:** **pnpm workspace monorepo from day 1.** Structure: `apps/web/` (Next.js app), `packages/` (empty until Phase 5 adds `kiwi-core`). Avoids the painful refactor v1 hit at its phase 4.
- **D-06:** **Provision Supabase + Vercel cloud projects in Phase 1.** `main` auto-deploys to production; Vercel preview per PR. Google OAuth needs a real callback URL anyway.
- **D-07:** **Trunk + feature branches.** `main` is always deployable. Each phase/plan ships via feature branch + PR. Plays well with GSD's atomic-commit model.
- **D-08:** **Public GitHub repository from day 1.** MIT license, gitleaks pre-commit hook (FOUND-05), `.env.example` documenting every required env var. `SUPABASE_SERVICE_ROLE_KEY` referenced only in server code (never imported into Client Components).

### First-run UX
- **D-09:** **Sign-in page is minimalist:** Hyperpolymath wordmark in EB Garamond, "Sign in with Google" button, one-liner "I brought back the Renaissance." (mirrors README.md). No marketing splash. No animation in Phase 1 (defer to Phase 6 if any).
- **D-10:** **Authenticated landing route is `/today`** from day 1. Phase 1 ships a stub "Coming soon" card; later phases fill it in (Phase 5 may make it the Kiwi Console). Stable URL prevents redirect rewrites across phases.
- **D-11:** **First sign-in routes to a one-screen onboarding:** "When do you graduate?" (year picker, single submit) → `/today`. Subsequent sign-ins skip onboarding. Backend: `users.onboarded_at timestamptz NULL` flag + `users.graduation_year int NOT NULL` (default the schema column to NULL pending onboarding completion). Onboarding screen feels like Linear's first-run — single question, one button.
- **D-12:** **Sign-out returns to the sign-in page.** No goodbye splash. One less route to design.

### Dev workflow & CI
- **D-13:** **Local Supabase via Docker** (`supabase start`) for development. Drizzle config has separate connection strings for local + cloud (read from `DATABASE_URL` / `DATABASE_URL_DEV` env vars). Local URL is the standard `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- **D-14:** **Drizzle migrations from day 1 — `drizzle-kit generate` + `drizzle-kit migrate`.** Migration SQL files committed to `apps/web/drizzle/`. No `drizzle-kit push` in any environment (prevents PITFALLS Pitfall 20 — schema drift). RLS policies live in the same migration file as the table that enables RLS.
- **D-15:** **GitHub Actions deferred to Phase 6.** Deviation from recommendation; user accepted the trade-off (faster Phase 1 vs no automated CI gate). Discipline: run `pnpm typecheck && pnpm test` locally before merging any PR. Branch protection without CI is honor-system in Phase 1; CI added in Phase 6.
- **D-16:** **pnpm** as package manager. Standard for monorepos in 2026; deterministic; well-supported on Vercel + Supabase.

### Claude's Discretion
- Exact onboarding screen copy and visual treatment (within minimalist brand)
- Drizzle schema file organization (`apps/web/db/schema.ts` single file vs per-domain split)
- Whether to use Drizzle's `relations()` helper or pure foreign keys
- Exact SQL for the `is_class` CHECK constraint and the priority/status enum literal escaping (`P∞` is non-ASCII)
- Whether to add a Postgres trigger to enforce junction `user_id` matches parent `user_id`, in addition to Server Action enforcement
- Folder structure within `apps/web/` (route groups, lib organization)
- Vercel project name and Supabase project name conventions
- Whether `users.id` mirrors `auth.users.id` directly or has its own UUID (recommend mirror — simpler joins)
- Sign-in page exact layout (within minimalist constraint)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope
- `.planning/PROJECT.md` — Locked scope, constraints, Key Decisions table, non-negotiables (P∞, lesno, capture-first)
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: FOUND-01..06, AUTH-01..05, SET-01, TEST-04
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria, phase ordering rationale
- `.planning/STATE.md` — Current project position and accumulated decisions

### Stack & libraries (locked)
- `.planning/research/STACK.md` — Version-specific patterns: Next.js 16 (`proxy.ts`), `@supabase/ssr` 0.10.x with `getClaims()` (NOT `getSession`), Drizzle ORM 0.36.x+ on `postgres` driver, Supavisor transaction pooler (port 6543, `prepare: false`), Tailwind 4 + shadcn/ui setup, EB Garamond via `next/font/google`, Vitest 3.x with `vite-tsconfig-paths`

### Architecture (must read before planning schema/auth/RLS)
- `.planning/research/ARCHITECTURE.md` §3 (Schema design — single-table inheritance for projects, denormalized user_id on junctions, enum types preserving P∞/lesno)
- `.planning/research/ARCHITECTURE.md` §4 (Component boundaries — Server Components + Client islands, route group `(app)/layout.tsx` auth gate, Server Actions for mutations)
- `.planning/research/ARCHITECTURE.md` §6 (RLS — `(select auth.uid()) = user_id` policies, junction table policies)

### Pitfalls (Phase 1 must address all 5)
- `.planning/research/PITFALLS.md` Pitfall 1 (RLS-enabled-but-policyless silent empty results — every `ENABLE ROW LEVEL SECURITY` ships in same migration as policies; integration test from real client sessions)
- `.planning/research/PITFALLS.md` Pitfall 2 (Cookie + middleware redirect loops — `proxy.ts` must call `supabase.auth.getClaims()` and rewrite the response cookies; never redirect from inside the middleware itself)
- `.planning/research/PITFALLS.md` Pitfall 3 (Vercel + Supabase pool exhaustion — Supavisor port 6543, `prepare: false` on Drizzle's postgres driver)
- `.planning/research/PITFALLS.md` Pitfall 11 (Public-repo + service-role-key leak — gitleaks pre-commit, never import service role into Client Components)
- `.planning/research/PITFALLS.md` Pitfall 20 (Schema drift — `drizzle-kit generate` + `drizzle-kit migrate`, no `push`)

### Product spec & v1 reference
- `resources/core.md` — Canonical product spec; the source of the v1 schema shape
- `resources/HYPERPOLYMATH_V2_HANDOFF.md` §7 (Data model — v1 type signatures: `Task`, `Project`, `Area`, `Post`, `Hashtag`, `Objective`, `Priority`, `TaskStatus`)
- `resources/HYPERPOLYMATH_V2_HANDOFF.md` §9 (Firestore layout — patterns to translate to Postgres)
- `resources/HYPERPOLYMATH_V2_HANDOFF.md` §15 (Conventions — TS strict, PascalCase types, camelCase fields, `@/` import alias)
- `resources/HYPERPOLYMATH_V2_HANDOFF.md` §18 (Non-negotiables — preserve `P∞`, `lesno` literal strings)
- `resources/idea_for_polymathy.md` — Brand voice for sign-in/onboarding copy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

None — greenfield project. Repository contains only `README.md`, `.gitignore`, and `resources/` (the spec docs). All scaffolding established in this phase.

### Established Patterns

None to inherit. Patterns being established in Phase 1 will be the standard for Phases 2-6:
- Monorepo layout (`apps/web` + `packages/`)
- Server Component shell + Client island per page
- Server Actions for mutations (no API routes for in-app data)
- Route group `(app)/layout.tsx` for auth gating
- Drizzle schema-as-source-of-truth in `apps/web/db/schema.ts`
- RLS policies in same migration as table-enable
- Vitest harness in `apps/web/tests/`

### Integration Points

- **Supabase Auth ↔ users table**: `users.id` mirrors `auth.users.id` (UUID). A Postgres trigger on `auth.users` insert creates the matching `public.users` row.
- **proxy.ts ↔ every page request**: cookie refresh runs on every request that matches the matcher; auth gate runs in `(app)/layout.tsx` after middleware.
- **Vercel deploy ↔ Supabase env**: Vercel project env vars hold `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (Supavisor 6543).

</code_context>

<specifics>
## Specific Ideas

- **Sign-in one-liner:** "I brought back the Renaissance." (matches the existing `README.md`)
- **Landing route `/today`** mirrors v1 — preserves Filippo's muscle memory across the rebuild
- **Onboarding feels like Linear's first-run setup** — single question, one button, zero friction
- **EB Garamond** is the typography Phase 1 commits to publicly (FOUND-04). Louize is deferred to Phase 6 if licensing resolves.

</specifics>

<deferred>
## Deferred Ideas

- **GitHub Actions CI** — Deferred to Phase 6 (deviation from research recommendation; explicit user decision; honor-system local typecheck+test in the meantime)
- **Theme toggle UI (light/dark)** — Phase 6 (AES-06, SET-03)
- **`/insights` telemetry page** — Phase 6 (RES-06)
- **`error.tsx` per route group + Sentry wiring** — Phase 6 (RES-01, RES-07)
- **Toast notifications + empty states with brand voice** — Phase 6 (RES-02, RES-03)
- **Custom production domain** — Phase 6 (cosmetic)
- **Goodbye splash on sign-out** — Out of scope (not in any phase)
- **Marketing landing page** — Out of scope for v2 MVP
- **Email/password auth fallback** — Permanently out of scope (PROJECT.md Out of Scope)
- **Supabase branch databases per PR** — Future improvement; not needed for MVP
- **Postgres trigger to enforce junction `user_id` matches parent** — Claude's discretion; may add if Server Action enforcement feels brittle

</deferred>

---

*Phase: 01-foundations*
*Context gathered: 2026-05-10*
