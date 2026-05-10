---
phase: 01-foundations
plan: 01
subsystem: infra
tags: [next.js-16, react-19, tailwind-4, typescript, supabase, drizzle, vitest, biome, shadcn, eb-garamond, gitleaks, supavisor, vercel, monorepo, pnpm]

requires:
  - phase: (none — first phase)
    provides: greenfield repo
provides:
  - pnpm workspace monorepo with apps/web bootstrapped
  - Next.js 16 + React 19.2 + Tailwind 4 + TypeScript strict, builds and serves
  - EB Garamond loaded via next/font/google as the base serif
  - Supabase three-client pattern (server, client, middleware) using @supabase/ssr 0.10.x with getClaims() (NOT getSession)
  - Next.js 16 proxy.ts (renamed middleware.ts) refreshing Supabase auth cookies
  - Drizzle ORM 0.36.x wired to Supavisor transaction pooler (port 6543) with prepare:false (postgres-js driver, NOT pg)
  - Vitest 3.x test harness with vite-tsconfig-paths and @vitejs/plugin-react; jest-dom + dotenv loaded in setup
  - shadcn/ui components.json + button primitive
  - Biome configured (2-space, double quotes, semicolons, TS strict)
  - gitleaks 8.30.1 pre-commit hook via husky; .gitleaks.toml + .gitignore blocks .env*
  - Public GitHub repo (filippo-fonseca/hyperpolymath-v2) live, MIT licensed
  - Supabase cloud project (ntxderfsvexulmtygjxo) provisioned with Data API ON, Auto-RLS ON, Auto-expose-tables OFF
  - Vercel project linked to GitHub, root directory apps/web, deployed and rendering EB Garamond
affects: [01-02-schema, 01-03-auth, 02-manual-crud, 03-realtime, 04-calendar, 05-kiwi, 06-polish]

tech-stack:
  added:
    - next@16
    - react@19.2
    - react-dom@19.2
    - typescript@5
    - tailwindcss@4.1
    - "@tailwindcss/postcss@4.1"
    - "@supabase/ssr@0.10.0"
    - "@supabase/supabase-js@2.45.0"
    - drizzle-orm@0.36.x
    - drizzle-kit@0.36.x
    - postgres@3
    - vitest@3
    - "@vitejs/plugin-react"
    - vite-tsconfig-paths
    - "@testing-library/jest-dom@6"
    - "@testing-library/react"
    - jsdom
    - dotenv@16
    - "@biomejs/biome"
    - shadcn-ui
    - lucide-react
    - clsx
    - tailwind-merge
    - class-variance-authority
    - husky
    - gitleaks (system binary, not npm)
  patterns:
    - "pnpm workspace monorepo (apps/* + packages/* — packages/ empty until Phase 5 kiwi-core)"
    - "Three-Supabase-client pattern (server/client/middleware) per @supabase/ssr 0.10.x docs"
    - "proxy.ts at apps/web root (Next.js 16 rename) for cookie refresh; auth gate deferred to (app)/layout.tsx"
    - "Drizzle on postgres-js driver with prepare:false for serverless Supavisor compatibility"
    - "Vitest setup: dotenv config({ path: '.env.local' }) before jest-dom import"
    - "gitleaks pre-commit hook + .env* gitignore as defense-in-depth against secret leaks"

key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - .gitignore
    - .gitleaks.toml
    - .env.example
    - LICENSE
    - .husky/pre-commit
    - apps/web/package.json
    - apps/web/tsconfig.json
    - apps/web/next.config.ts
    - apps/web/postcss.config.mjs
    - apps/web/biome.json
    - apps/web/components.json
    - apps/web/drizzle.config.ts
    - apps/web/vitest.config.mts
    - apps/web/vitest.setup.ts
    - apps/web/proxy.ts
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - apps/web/app/globals.css
    - apps/web/lib/utils.ts
    - apps/web/lib/supabase/server.ts
    - apps/web/lib/supabase/client.ts
    - apps/web/lib/supabase/middleware.ts
    - apps/web/lib/db/client.ts
    - apps/web/lib/db/index.ts
    - apps/web/components/ui/button.tsx
    - apps/web/tests/smoke.test.ts
    - apps/web/tests/db-smoke.test.ts
    - apps/web/supabase/config.toml
    - apps/web/supabase/.gitignore
  modified:
    - .planning/STATE.md (status -> executing, current focus -> Phase 1)
    - .planning/config.json
    - .planning/phases/01-foundations/01-01-PLAN.md (task progress)
    - .planning/phases/01-foundations/01-02-PLAN.md (task progress)
    - .planning/phases/01-foundations/01-03-PLAN.md (task progress)
    - README.md (restored wordmark + tagline)

key-decisions:
  - "Used legacy JWT-format Supabase keys (eyJ...) instead of new sb_publishable_/sb_secret_ — both work; user's project initialized with both formats and JWT was simpler to identify in dashboard"
  - "Region detected as us-west-2 (aws-1-us-west-2.pooler.supabase.com) based on user's actual Supabase project provisioning"
  - "Supabase project settings on creation: Data API ON, Auto-expose-new-tables OFF, Automatic RLS ON (defense-in-depth aligned with PITFALLS Pitfall 1)"
  - ".env.local lives in apps/web/, NOT repo root (Next.js + Drizzle + Vitest all run with apps/web as cwd)"
  - "Pulled the dotenv prepend in vitest.setup.ts forward from Plan 01-02 Task 2 to validate the cloud DATABASE_URL at the Plan 01-01 checkpoint (Truth B); Plan 01-02 won't need to redo this work"

patterns-established:
  - "Single source of truth for env vars: apps/web/.env.local (gitignored) + .env.example (committed) at repo root for documentation"
  - "Atomic per-task commits with conventional commit prefix (feat(01-01): Task 1a -, etc.)"
  - "GSD plan progress tracked via gsd-tools commit helper (auto-updates plan markdown)"

requirements-completed:
  - FOUND-01
  - FOUND-02
  - FOUND-04
  - FOUND-05
  - FOUND-06

duration: ~50min (autonomous tasks 1a/1b/2 + ~20min user-side cloud provisioning)
completed: 2026-05-10
---

# Phase 1 Plan 01: Repo + Tooling + Cloud Setup Summary

**Hyperpolymath v2 monorepo bootstrapped, deployed live to Vercel, and proven to talk to cloud Postgres via Supavisor — every dependency for Phases 2-6 is now in place.**

## Performance

- **Duration:** ~50 minutes (3 autonomous tasks + 1 human checkpoint)
- **Tasks:** 4 (1a, 1b, 2 autonomous + 3 human-verify)
- **Files created:** ~30
- **Commits:** 5 (3 task commits + 1 cleanup + 1 dotenv fix)

## Accomplishments

- Greenfield repo to live-deployed Next.js 16 app on Vercel in one phase
- Drizzle proven against cloud Supavisor pooler (`SELECT 1` round-trip in 877ms with `prepare:false`) — Truth B validated
- All 5 critical foundation pitfalls (RLS-policyless, cookie-refresh-loops, pool-exhaustion, secret-leaks, schema-drift) addressed at the architectural level

## Task Commits

1. **Task 1a — Workspace + Next.js 16 shell + EB Garamond:** `5c4ed38`
2. **Task 1b — Supabase clients + Drizzle + Vitest + Biome + shadcn:** `53de8d3`
3. **Task 2 — gitleaks + Supabase init + db-smoke test:** `5c926bc`
4. **Cleanup — state updates + Next.js scaffolding artifacts:** `2575b73`
5. **Fix — prepend dotenv in vitest.setup.ts (Truth B validation):** `11c2d9e`
6. **Task 3 — cloud provisioning (human checkpoint, no code commit):** approved by user 2026-05-10

## Decisions Made

See key-decisions in frontmatter. Notable: legacy JWT-format keys are fine (no need to migrate to `sb_publishable_*` format); `.env.local` lives in `apps/web/` not repo root; Supabase Auto-RLS toggle enabled as defense-in-depth.

## Deviations from Plan

### Pulled forward: dotenv loading in vitest.setup.ts

- **Found during:** Task 3 cloud-checkpoint verify
- **Issue:** Plan 01-02 Task 2 Step 5 was scheduled to add the dotenv prepend to `vitest.setup.ts`. But Truth B validation (cloud `DATABASE_URL` reachable via Supavisor 6543) at the Plan 01-01 checkpoint requires that env loading already work — `db-smoke.test.ts` was silently skipping because `process.env.DATABASE_URL` was undefined.
- **Fix:** Prepended `import { config } from "dotenv"; config({ path: ".env.local" });` to `vitest.setup.ts` at the top, before the jest-dom import.
- **Files modified:** `apps/web/vitest.setup.ts`
- **Verification:** `pnpm test` from `apps/web/` now runs `db-smoke.test.ts` for 877ms (real round-trip) and `SELECT 1` returns 1.
- **Committed in:** `11c2d9e`
- **Plan 01-02 Task 2 Step 5 implication:** No-op now; the work is done. Plan 01-02 verify can `head -5 vitest.setup.ts | grep -q "dotenv"` and pass immediately.

### Cleanup: stray create-next-app artifacts

- **Found during:** Task 3 pre-push tidy
- **Issue:** Boilerplate files left over from `create-next-app` were untracked: `apps/web/CLAUDE.md` (just `@AGENTS.md` pointer), `apps/web/AGENTS.md` (generic Next.js rules), `apps/web/README.md` (boilerplate). Root README.md was also accidentally truncated to empty during scaffolding.
- **Fix:** Deleted the three boilerplate files (we have a root `CLAUDE.md` already); restored `README.md` content (wordmark + tagline). Kept `apps/web/.gitignore`, `apps/web/app/favicon.ico`, `apps/web/public/` (legit Next.js artifacts).
- **Committed in:** `2575b73`

## Verification Status

- ✅ `pnpm install` succeeds at root
- ✅ `pnpm typecheck` passes (TS strict, zero errors)
- ✅ `pnpm test` passes (smoke + db-smoke against cloud Supavisor 6543)
- ✅ `pnpm build` succeeds; production bundle compiles
- ✅ gitleaks pre-commit hook runs on every commit (verified during this phase's commits)
- ✅ Supabase cloud project live at `https://ntxderfsvexulmtygjxo.supabase.co`
- ✅ Public GitHub repo live at `https://github.com/filippo-fonseca/hyperpolymath-v2`
- ✅ Vercel project deployed; landing page renders Hyperpolymath wordmark in EB Garamond (user-confirmed in browser)

## Outstanding (post-Wave 1)

- 🚨 **Rotate `2407BabsonBeavers97` DB password** — user shared in chat twice; should be rotated before any production traffic. Update `.env.local` + Vercel env vars.
- Plan 01-02 will create the schema and run `pnpm dlx supabase db reset --no-seed` against local Supabase (D-13 — Docker required).
