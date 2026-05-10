---
phase: 01-foundations
plan: 03
subsystem: auth
tags: [google-oauth, supabase-auth, route-group-guard, server-actions, onboarding, settings, eb-garamond, getclaims, tdd]

requires:
  - phase: 01-01
    provides: Supabase three-client pattern, proxy.ts cookie refresh, lib/db client
  - phase: 01-02
    provides: users table with onboarded_at flag, auth.users → public.users trigger
provides:
  - Google OAuth sign-in flow end-to-end (Supabase Auth + locally-configured Google provider)
  - decideLandingRoute() pure helper (TDD'd — RED commit ce4ae78, GREEN commit 5a07e29)
  - Single (app)/layout.tsx route-group auth gate (AUTH-03 — replaces v1's per-page guards)
  - getUserOrRedirect() + requireOnboarded() helpers using getClaims() never getSession() (PITFALLS Pitfall 2)
  - /auth/callback Route Handler — exchanges OAuth code, queries users.onboarded_at, redirects via decideLandingRoute
  - /auth/sign-out Route Handler (POST → 303 to /sign-in)
  - /sign-in page — minimalist EB Garamond + "Sign in with Google" + "I brought back the Renaissance." (D-09)
  - /today stub (D-10) — protected by requireOnboarded()
  - /onboarding page + Server Action — year picker → completeOnboarding sets BOTH graduation_year AND onboarded_at = sql`now()` (D-11, Warning 6 fix from plan-checker)
  - /settings page + Server Action — graduation year edit (SET-01) + sign-out button (AUTH-04)
  - shadcn/ui Card primitive
  - tests/onboarding-redirect.test.ts (TDD RED → GREEN cycle)
  - Local Supabase Google provider configuration via env-substituted config.toml
affects: [02-manual-crud, 03-realtime, 04-calendar, 05-kiwi, 06-polish]

tech-stack:
  added:
    - "@radix-ui/react-slot (via shadcn card)"
  patterns:
    - "Single (app)/layout.tsx auth gate — replaces v1's per-page onAuthStateChanged checks"
    - "PKCE OAuth flow — signInWithOAuth (browser) → /auth/v1/authorize (Supabase) → Google → /auth/v1/callback (Supabase) → /auth/callback (our app) → exchangeCodeForSession → redirect by decideLandingRoute"
    - "Server Action validation: parse with Zod-ish manual checks, throw on invalid (caught by Next.js error boundary)"
    - "Sign-out is a POST Route Handler (not Server Action) — form action='/auth/sign-out' method='POST' for simple HTML form integration"
    - "Local Supabase OAuth config via env-substituted strings: env(SUPABASE_AUTH_EXTERNAL_GOOGLE_*)"

key-files:
  created:
    - apps/web/lib/auth/routing.ts
    - apps/web/lib/auth/get-user.ts
    - apps/web/app/(app)/layout.tsx
    - apps/web/app/auth/callback/route.ts
    - apps/web/app/auth/sign-out/route.ts
    - apps/web/app/sign-in/page.tsx
    - apps/web/app/(app)/today/page.tsx
    - apps/web/app/(app)/onboarding/page.tsx
    - apps/web/app/(app)/onboarding/actions.ts
    - apps/web/app/(app)/settings/page.tsx
    - apps/web/app/(app)/settings/actions.ts
    - apps/web/components/sign-in-button.tsx
    - apps/web/components/sign-out-button.tsx
    - apps/web/components/onboarding-form.tsx
    - apps/web/components/settings-form.tsx
    - apps/web/components/ui/card.tsx
    - apps/web/tests/onboarding-redirect.test.ts
  modified:
    - apps/web/app/page.tsx (root → redirects to /today or /sign-in based on auth)
    - apps/web/supabase/config.toml (added [auth.external.google] block + per-provider redirect_uri + updated site_url to localhost:3000 + extended additional_redirect_urls)

key-decisions:
  - "Pivoted Wave 3 from cloud-Supabase verification to local-Supabase verification per user request — schema isn't applied to cloud yet (deferred to Phase 6 CI). Cloud Supabase is wired (Vercel env vars set) but RLS test + auth flow are exercised against local Supabase only."
  - "Set per-provider redirect_uri = 'http://127.0.0.1:54321/auth/v1/callback' in [auth.external.google] block — Supabase Auth (GoTrue) requires this explicitly for non-default providers; default derivation via API_EXTERNAL_URL was not happening, causing 'Unsupported provider: missing redirect URI' errors."
  - "Set skip_nonce_check = true on Google provider — required for local sign-in per the config.toml inline documentation."
  - "Updated site_url + additional_redirect_urls in [auth] block to allow http://localhost:3000 (the Next.js dev URL) — the default config only allowed http://127.0.0.1:3000 which doesn't match what the browser sends."
  - "Pulled forward the SUMMARY.md creation from the original plan's Task 3 (live OAuth checkpoint approval) — checkpoint approved by user after live walkthrough confirmed sign-in → onboarding → /today → settings edit → sign-out → re-sign-in (skip onboarding) all worked."

patterns-established:
  - "Auth gate at (app)/layout.tsx is the SINGLE source of truth — no per-page guards anywhere else in the app"
  - "Server Actions for mutations: file with 'use server' directive at top, exported async function, takes FormData, throws on invalid"
  - "OAuth provider config is layered: Google Cloud OAuth client (one for both local + prod) → Supabase Auth (separate config for cloud vs local Supabase) → app code (provider-agnostic via signInWithOAuth)"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04
  - SET-01

duration: ~1.5 hours including extensive OAuth debugging (config.toml redirect_uri, env var loading order, localhost vs 127.0.0.1 in allowlist)
completed: 2026-05-10
---

# Phase 1 Plan 03: Auth + UX Shell Summary

**End-to-end Google OAuth flow live on local — sign-in → onboarding (graduation year) → /today → settings edit → sign-out → re-sign-in skips onboarding. The full Phase-1 user journey works.**

## Performance

- **Duration:** ~1.5 hours (including OAuth config debugging — see Deviations)
- **Tasks:** 3 (1a TDD'd routing helper + 1b pages/components/actions + 2 live OAuth checkpoint)
- **Files created:** 17
- **Files modified:** 2 (page.tsx, supabase/config.toml)
- **Commits:** 4 (ce4ae78 RED, 5a07e29 GREEN, 8944a8d pages, plus this SUMMARY commit)

## Accomplishments

- TDD'd the routing logic before implementing it (red commit, then green)
- Single auth gate at `(app)/layout.tsx` replaces v1's per-page boilerplate
- All 13 success criteria from the live walkthrough verified end-to-end
- Onboarding action correctly sets BOTH `graduation_year` AND `onboarded_at` — first-run flag works (re-sign-in goes directly to /today, not back to /onboarding)
- All 9 tests across 4 files pass after the auth flow is in place (no regressions)

## Task Commits

1. **Task 1a (RED):** `ce4ae78` — `tests/onboarding-redirect.test.ts` failing test for decideLandingRoute
2. **Task 1a (GREEN):** `5a07e29` — `lib/auth/routing.ts` + `get-user.ts` + `(app)/layout.tsx` + `auth/callback/route.ts` + `auth/sign-out/route.ts` (test passes)
3. **Task 1b:** `8944a8d` — sign-in page (D-09), /today stub (D-10), /onboarding (D-11), /settings (SET-01+AUTH-04), all components
4. **Task 2 (live OAuth checkpoint):** approved by user 2026-05-10 after walkthrough

## Decisions Made

See `key-decisions` in frontmatter. Notable: pivoted from cloud-Supabase verification to local; added per-provider `redirect_uri` to fix Supabase Auth bootstrap.

## Deviations from Plan

### Pivoted to local Supabase for verification (vs cloud as plan stated)

- **Found during:** Task 2 live walkthrough on Vercel deploy
- **Issue:** The callback's `db.select(...).from(users)` query crashed because the cloud Supabase had no `users` table — Plan 01-02 only applied schema to local Supabase (per the plan's own truth: "cloud schema apply deferred to Phase 6 CI"). User explicitly asked to dev locally, which aligns better with D-13.
- **Fix:** Repointed `apps/web/.env.local` from cloud to local Supabase creds; added Google provider config to `apps/web/supabase/config.toml`; user added `http://127.0.0.1:54321/auth/v1/callback` to Google OAuth client redirect URIs; restarted local Supabase to pick up new config.
- **Files modified:** `apps/web/.env.local` (gitignored), `apps/web/supabase/config.toml`
- **Verification:** Live walkthrough end-to-end on `http://localhost:3000` — all 13 checks passed
- **Cloud implication:** Vercel deploy at `https://hyperpolymath-v2.vercel.app` will not work end-to-end until cloud Supabase has the schema applied (deferred to a future cleanup or Phase 6 CI). Sign-in page renders fine; clicking Google sign-in starts the OAuth flow but the callback will crash at the db query. This is acceptable for now since Phase 1's success criteria are all about local development primitives being correct.

### Added per-provider redirect_uri to fix "Unsupported provider: missing redirect URI"

- **Found during:** First OAuth attempt on local
- **Issue:** Even with Google provider enabled and credentials set, GoTrue (Supabase Auth) returned "Unsupported provider: missing redirect URI" on every `/auth/v1/authorize?provider=google` request. The default-derivation of redirect_uri from API_EXTERNAL_URL was not happening for OAuth providers.
- **Fix:** Set `redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"` explicitly in `[auth.external.google]` block.
- **Files modified:** `apps/web/supabase/config.toml`
- **Verification:** `curl http://127.0.0.1:54321/auth/v1/authorize?provider=google&redirect_to=...` returns 302 → `https://accounts.google.com/o/oauth2/v2/auth?...` (correct OAuth bootstrap)

### Updated site_url + additional_redirect_urls

- **Found during:** First OAuth attempt — even with Google enabled, redirects to `localhost:3000` were being rejected
- **Issue:** Default config has `site_url = "http://127.0.0.1:3000"` and `additional_redirect_urls = ["https://127.0.0.1:3000"]`. Browser uses `http://localhost:3000` which doesn't match either entry. Supabase rejected redirects with "URL not allowed".
- **Fix:** Set `site_url = "http://localhost:3000"` and expanded allowlist to `["http://localhost:3000", "http://localhost:3000/**", "http://127.0.0.1:3000", "http://127.0.0.1:3000/**"]`.
- **Files modified:** `apps/web/supabase/config.toml`

## Verification Status

- ✅ `pnpm typecheck` passes
- ✅ `pnpm test` passes — 9 tests across 4 files (smoke, db-smoke, rls, onboarding-redirect)
- ✅ `pnpm --filter web build` succeeds — all 7 routes compile
- ✅ Live walkthrough on `http://localhost:3000` — all 13 user-facing checks passed (sign-in → consent → onboarding → /today → settings edit (year persists across refresh) → sign-out → re-sign-in skips onboarding)
- ⚠️ Vercel cloud deploy: sign-in page renders, but full auth flow not exercisable until cloud schema is applied (out of Phase 1 scope per ROADMAP plan ordering)

## Outstanding (post-Phase-1)

- 🚨 **Rotate Google Client Secret** — `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` was pasted in chat; should be rotated before any production traffic. Update `apps/web/.env.local` AND Supabase cloud Google provider config.
- 🚨 **Rotate DB password** — `2407BabsonBeavers97` was pasted in chat earlier; rotate via Supabase Dashboard, update Vercel env vars.
- Cloud Supabase schema apply — deferred. When ready: link the project (`supabase link --project-ref ntxderfsvexulmtygjxo`) and `supabase db push`. Current Phase 1 ships fine without this.
