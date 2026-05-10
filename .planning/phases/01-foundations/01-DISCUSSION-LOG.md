# Phase 1: Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 01-foundations
**Areas discussed:** Schema scope & modeling, Repo & deployment, First-run UX, Dev workflow & CI

---

## Schema scope & modeling

### Q1: How much schema do we model in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Full v1 upfront (Recommended) | Model every table now: users, areas, projects, tasks, captures, hashtags, all junctions, kiwi_events. Phase 2-5 just wire UI/logic. One coherent schema review; downstream phases never block on migrations. | ✓ |
| Foundations + tables I touch this phase | Just users + a settings shape now (graduation year). Each later phase adds its own tables. Smaller PRs but more migration churn + schema-shape decisions deferred. | |
| Foundations + areas/projects only | Users + the hierarchy backbone (areas, projects). Phase 2+ adds tasks/captures/hashtags/etc. | |

**User's choice:** Full v1 upfront

### Q2: Postgres enums vs text+CHECK for P∞/lesno literals?

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres enum types (Recommended) | CREATE TYPE priority AS ENUM ('P∞', 'P1', 'P2', 'P3'). DB-enforced, faster, clean Drizzle types. Adding values needs ALTER TYPE migration but rare for these. | ✓ |
| Text + CHECK constraint | TEXT with CHECK (priority IN ('P∞', ...)). Easier to evolve; matches v1's loose typing. Slightly slower; less self-documenting. | |
| Text only, app-validated | Just TEXT, Zod validates at boundary. Most flexible, weakest invariant. | |

**User's choice:** Postgres enum types

### Q3: Junction tables — denormalize user_id?

| Option | Description | Selected |
|--------|-------------|----------|
| Denormalize (Recommended) | Store user_id directly on every junction row. RLS policy is a one-step `(select auth.uid()) = user_id` — fast, no recursive lookups (PITFALLS Pitfall 1 prevention). Cost: enforce consistency via FK + trigger or app-level. | ✓ |
| Reference parent for RLS | Junction RLS does subquery to parent table's user_id. Stricter normalization. Slower joins; risk of recursive policy bugs. | |

**User's choice:** Denormalize

### Q4: Project-as-Class — single table or split?

| Option | Description | Selected |
|--------|-------------|----------|
| Single projects table (Recommended) | One `projects` table with `is_class boolean` + nullable class metadata cols (course_code, instructor, semester, grade, credits, distributionals[]). CHECK constraint enforces all-or-none when is_class=true. Matches v1; simpler queries. | ✓ |
| Separate classes table | `projects` with FK to `classes` for the academic metadata. Cleaner but needs joins everywhere a class shows up. | |

**User's choice:** Single projects table

---

## Repo & deployment

### Q1: Monorepo workspace from day 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Monorepo from day 1 (Recommended) | pnpm workspace with apps/web + packages/. Phase 5 just adds packages/kiwi-core. Tiny upfront cost; avoids painful refactor later. Filippo's v1 hit this exact pivot in phase 4. | ✓ |
| Single app, refactor later | Plain Next.js app at root; convert to workspace at Phase 5. Simpler now; refactor pain later. | |
| Monorepo + kiwi-core skeleton now | Stub packages/kiwi-core as empty TS package in Phase 1 even though no code lives in it yet. Most thorough; arguably premature. | |

**User's choice:** Monorepo from day 1

### Q2: Vercel + Supabase cloud setup in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Both, in Phase 1 (Recommended) | Provision Supabase project + Vercel project in Phase 1. Deploy `main` automatically. Real preview URLs from day 1; Google OAuth needs a real callback URL anyway. | ✓ |
| Supabase cloud, defer Vercel | Cloud Postgres for shared dev; localhost:3000 for the app. Defer Vercel deploy until Phase 6. | |
| Local-only | Local Supabase via Docker; deploy later. Slowest path to a working OAuth flow. | |

**User's choice:** Both, in Phase 1

### Q3: Branch strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Trunk + feature branches (Recommended) | main is always deployable; each phase/plan goes through a feature branch + PR. Vercel preview per PR. Plays well with GSD's atomic-commit model. | ✓ |
| Direct to main | Single-developer, just push to main. Faster but no preview-per-change, no easy revert. | |
| main + dev integration branch | Classic gitflow-lite. Overkill for single-user. | |

**User's choice:** Trunk + feature branches

### Q4: Repository visibility?

| Option | Description | Selected |
|--------|-------------|----------|
| Public from day 1 (Recommended) | Open-source posture per PROJECT.md. gitleaks + .env.example shipped in Phase 1 anyway. Build in public matches the brand. | ✓ |
| Private until MVP | Iterate without scrutiny; flip to public when polished. Risk: never flipping it. | |

**User's choice:** Public from day 1

---

## First-run UX

### Q1: Sign-in page design?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimalist (Recommended) | Hyperpolymath wordmark in EB Garamond + 'Sign in with Google' button + a one-liner ('I brought back the Renaissance.'). Restraint matches the brand. Fast to build. | ✓ |
| Marketing splash | Hero, manifesto excerpt, neural-bg-style animation — mirrors v1's landing. More polish, but it's Phase-6 polish work being pulled forward. | |
| Bare functional | Just the button on a blank page. Build it later in Phase 6. Lowest cost. | |

**User's choice:** Minimalist

### Q2: Authenticated landing route in Phases 1-4?

| Option | Description | Selected |
|--------|-------------|----------|
| /today placeholder (Recommended) | Authenticated landing is `/today` from day 1 — starts as a 'Coming soon' stub, fills in as phases ship. Phase 5 may rename it; Phase 6 polishes. Stable URL prevents redirect rewrites. | ✓ |
| /settings | Land on settings until Kiwi exists. Functional but uninspiring; nothing to do there until Phase 4 (gcal connect). | |
| /projects | Land on the projects/areas tree. Empty until Phase 2 ships. Practical once content exists. | |
| Auto-route by phase | Phase 1: /settings. Phase 2: /tasks. Phase 5: /. Cleaner per phase but breaks bookmarks across rebuilds. | |

**User's choice:** /today placeholder

### Q3: First sign-in onboarding?

| Option | Description | Selected |
|--------|-------------|----------|
| One-screen onboarding (Recommended) | First sign-in routes to a single onboarding screen: 'When do you graduate?' (year picker, single submit). Then to landing. Phase 2 needs grad-year for class semester options anyway, so default-with-skip risks invalid Class metadata. | ✓ |
| Allow skip with default | Default grad-year to current year + 4. User can change later in /settings. Faster sign-in; risk of forgotten setting. | |
| No onboarding | Land directly on /today. User discovers settings on their own. Friction-free; weakest first impression. | |

**User's choice:** One-screen onboarding

### Q4: Sign-out destination?

| Option | Description | Selected |
|--------|-------------|----------|
| Back to sign-in page (Recommended) | Standard. Same minimalist sign-in page. One less route to design. | ✓ |
| Goodbye splash | Brief 'See you soon.' page then sign-in. Brand touch; tiny extra build. | |

**User's choice:** Back to sign-in page

---

## Dev workflow & CI

### Q1: Local Supabase via Docker?

| Option | Description | Selected |
|--------|-------------|----------|
| Local Supabase (Recommended) | Local Postgres + Auth + Realtime via `supabase start` (Docker). Fast iteration, offline dev, no shared-cloud-state bugs. Push schema with `drizzle-kit push --force` in dev. Slight setup cost (Docker). | ✓ |
| Cloud-only | Dev directly against cloud Supabase. No Docker. Risk: stepping on shared dev DB; latency. | |
| Cloud + branch databases | Use Supabase branching (per-PR ephemeral DBs). Newer feature; matches Vercel preview model. Nicer DX; requires Supabase Pro on paid tier. | |

**User's choice:** Local Supabase

### Q2: Drizzle migration discipline?

| Option | Description | Selected |
|--------|-------------|----------|
| generate + migrate (Recommended) | `drizzle-kit generate` produces SQL files; `drizzle-kit migrate` applies. Versioned, reviewable, prod-safe. Slightly more friction in dev but PITFALLS Pitfall 20 (schema drift) is what this prevents. | ✓ |
| push in dev, generate before deploy | Fast `drizzle-kit push` for local iteration; generate proper migrations before merging to main. Best of both, requires discipline. | |
| push everywhere | Fastest, but no migration history. User said 'no migrations needed, starting fresh' — but for v2 ongoing, this loses an audit trail. | |

**User's choice:** generate + migrate

### Q3: GitHub Actions in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + typecheck on PR (Recommended) | Single workflow on every PR: pnpm install, typecheck, vitest run. ~2 min. Free tier sufficient. Catches breakage immediately. Branch protection: PR can't merge without green CI. | |
| Add later | Defer GitHub Actions to Phase 6. Faster Phase 1; means red main is possible during build. | ✓ |
| Vitest + typecheck + lint + build | Maximal CI from day 1. Slightly longer (~4 min). Catches build breakage too. | |

**User's choice:** Add later
**Notes:** Deviation from recommendation. Honor-system: run `pnpm typecheck && pnpm test` locally before merging.

### Q4: Package manager?

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm (Recommended) | Standard for monorepos in 2026. Strict workspace resolution, fast installs, deterministic. Vercel + Supabase both support it natively. | ✓ |
| bun | Faster installs + runtime. Workspace support solid in 2026. Slight risk: occasional Next.js compat quirks. | |
| npm | Default. Workspace support is decent now. Slowest installs. | |

**User's choice:** pnpm

---

## Claude's Discretion

Areas where Claude has flexibility during planning/implementation (full list in CONTEXT.md `<decisions>` section):
- Drizzle schema file organization (single file vs per-domain split)
- Use of Drizzle's `relations()` helper vs pure FKs
- Exact CHECK constraint SQL for `is_class`
- Whether to add a Postgres trigger for junction `user_id` consistency (in addition to Server Action enforcement)
- Folder structure within `apps/web/`
- Whether `users.id` mirrors `auth.users.id` directly (recommended) or has its own UUID
- Vercel + Supabase project naming
- Sign-in page exact layout (within minimalist constraint)
- Onboarding screen exact copy and visual treatment

## Deferred Ideas

- GitHub Actions CI → Phase 6
- Theme toggle (AES-06, SET-03) → Phase 6
- `/insights` telemetry (RES-06) → Phase 6
- `error.tsx` + Sentry (RES-01, RES-07) → Phase 6
- Toasts + empty states (RES-02, RES-03) → Phase 6
- Custom production domain → Phase 6
- Goodbye splash → out of scope
- Marketing landing → out of scope for v2 MVP
- Email/password auth fallback → permanently out of scope
- Supabase branch databases per PR → future improvement
