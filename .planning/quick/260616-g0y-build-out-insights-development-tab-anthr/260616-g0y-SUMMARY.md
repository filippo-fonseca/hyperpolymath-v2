---
phase: quick-260616-g0y
plan: 01
subsystem: insights / dev-analytics
tags: [insights, anthropic-api, claude-code, ccusage, drizzle, recharts]
requires:
  - claude_code_usage sync pipeline (260607-h2k)
  - DEVELOPMENT tab + dev-runs (260615-lkl)
provides:
  - anthropic_api_usage table + getAnthropicApiUsage Cost API read
  - claude_subscription_usage table + getClaudeSubscriptionUsage read
  - configurable Max-5x limits module
  - AnthropicApiPanel + ClaudeSubscriptionPanel on the DEVELOPMENT tab
affects:
  - /insights DEVELOPMENT tab (consolidated spend home)
  - /insights LIFE tab (Claude Code daily panel removed)
  - ccusage sync pipeline (script + ingest endpoint)
tech-stack:
  added: []
  patterns:
    - Result<T> server-fetch-in-page integration (D-06)
    - 60s in-process cache mirroring getClaudeCodeUsage
    - best-effort write-through (live fetch warms the table for a future cron)
    - Zod 4 defensive parsing of an external API shape
    - signed ccusage sync body extended without changing auth gates
key-files:
  created:
    - apps/web/drizzle/0016_anthropic_api_usage.sql
    - apps/web/drizzle/0017_claude_subscription_usage.sql
    - apps/web/lib/integrations/anthropic-api/usage.ts
    - apps/web/lib/integrations/claude-code/limits.ts
    - apps/web/lib/integrations/claude-code/subscription.ts
    - apps/web/components/insights/development/AnthropicApiPanel.tsx
    - apps/web/components/insights/development/ClaudeSubscriptionPanel.tsx
  modified:
    - apps/web/lib/db/schema.ts
    - apps/web/app/api/integrations/claude-code/sync/route.ts
    - tools/claude-code-sync.mjs
    - apps/web/app/(app)/insights/page.tsx
    - apps/web/components/insights/InsightsTabs.tsx
    - apps/web/components/insights/DevelopmentTabPanel.tsx
    - apps/web/components/insights/life/LifeTabPanel.tsx
decisions:
  - DEC-1 live Cost API fetch with 60s cache + write-through, not a cron upsert
  - DEC-2 new small claude_subscription_usage table, not an extension of claude_code_usage
  - DEC-3 percentages computed against configurable Max-5x constants, never scraped
  - DEC-4 migrations 0016/0017 hand-authored; meta/_journal.json untouched
metrics:
  completed: 2026-06-16
  tasks: 5 of 5 (task 6 is a blocking human-verify checkpoint, not executed)
---

# Quick 260616-g0y: Build out Insights DEVELOPMENT tab (Anthropic + Claude spend) Summary

Consolidated all Claude/Anthropic spend onto the owner-only Insights DEVELOPMENT tab: a live Anthropic API spend-per-day bar chart (Cost API with 60s cache + table write-through), a Claude Code Max-5x session + weekly subscription panel with clearly-labeled approximate percentages against configurable limits, and the daily Claude Code tokens panel moved off LIFE. Two new tables + migrations, two Result-returning server reads, a limits module, and an extended ccusage sync pipeline back it.

## What shipped (per task)

- **Task 1** (commit `3255492`): `anthropic_api_usage` + `claude_subscription_usage` `pgTable`s in `schema.ts` and hand-authored migrations `0016`/`0017` matching the `0012` style. Journal untouched.
- **Task 2** (commit `43861be`): `getAnthropicApiUsage` server read (live Cost API fetch, 60s cache, best-effort write-through, table fallback, never throws) and `AnthropicApiPanel` (hud-cyan spend-per-day bar chart with period cost/token/day totals).
- **Task 3** (commit `d3dd4aa`): `limits.ts` (`MAX_5X_LIMITS` + clamped `pct()`), `getClaudeSubscriptionUsage` (session + weekly read), and `ClaudeSubscriptionPanel` (session + weekly totals plus approximate, clearly-labeled percentages).
- **Task 4** (commit `fbfcae9`): extended `tools/claude-code-sync.mjs` (added `runCcusageBlocksActive`, `runCcusageWeekly`, `mapSession`, `mapWeek`; session/weeks ride the same signed POST body) and the ingest route (defensive upsert into `claude_subscription_usage`, response `{ upserted, sessionUpserted, weeksUpserted }`, auth gates and days path unchanged).
- **Task 5** (commit `2424955`): page fetches the two new reads in the owner-gated block and routes `claudeCode` to DEVELOPMENT; `DevelopmentTabPanel` renders all three spend panels + the unchanged runs list; `ClaudeCodePanel` removed from `LifeTabPanel`.

## Live shape verification (mandatory pre-coding step)

- **Anthropic Cost API curl**: FAILED with HTTP `401 invalid x-api-key`. The `ANTHROPIC_ADMIN_KEY` in `apps/web/.env.local` is a workspace key (prefix `sk-ant-api03-`, length 108), NOT an Admin API key (`sk-ant-admin01-...`). The Cost API requires a true Admin key. Both `x-api-key` and `Authorization: Bearer` variants returned 401. Per the constraint, I did NOT abort: `getAnthropicApiUsage` is implemented defensively (Zod-parsed against the documented Cost API shape: time-bucketed `data[]` with `starting_at` + `results[]` line items carrying `amount`/`cost` + token fields), and on the 401 it falls back to reading `anthropic_api_usage`; if that is empty it returns `err(...)` so the panel shows an inline error and never crashes. **FOLLOW-UP NEEDED: mint a real Admin API key in the Anthropic console and set `ANTHROPIC_ADMIN_KEY` to it so the live spend chart populates.** The defensive shape should be re-confirmed against a real 200 response once the Admin key is in place.
- **`ccusage blocks --active --json`**: verified live. Shape: `blocks[].{ id, startTime, endTime, costUSD, totalTokens, isActive, tokenCounts.{inputTokens,outputTokens,cacheReadInputTokens,cacheCreationInputTokens}, projection.{totalCost,totalTokens} }`. Note `block.totalTokens` is input+output only; `tokenCounts` holds the cache breakdown. Mapped defensively (camelCase + snake_case).
- **`ccusage weekly --json`**: verified live. Shape: `weekly[].{ period (ISO week-start YYYY-MM-DD), totalCost, totalTokens, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }` (note row-level cache fields are `cacheCreationTokens`/`cacheReadTokens`, distinct from the blocks `tokenCounts` `*InputTokens` naming). Mapped defensively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no node_modules**
- **Found during:** Task 1 verification (tsc reported "Cannot find module 'drizzle-orm'").
- **Issue:** This is a fresh pnpm-workspace worktree with no installed dependencies, so typecheck could not run.
- **Fix:** Ran `pnpm install --frozen-lockfile` (lockfile unchanged, no tracked changes). Typecheck then validated cleanly.
- **Files modified:** none committed.

**2. [Rule 3 - Blocking] .env.local absent from the worktree**
- **Found during:** Task 2 pre-coding curl.
- **Issue:** `apps/web/.env.local` is gitignored and not copied into fresh worktrees, so the admin key wasn't present in the worktree.
- **Fix:** Sourced the main repo's `apps/web/.env.local` (read-only, no writes to the main repo) solely to run the verification curl. No worktree files changed.

### CLAUDE.md adjustments
- Replaced em/en dashes I had written in new-file comments and UI copy with commas/colons/periods per the global writing-style rule (em/en dashes strongly disfavored). The null-cost placeholder uses `n/a` rather than an em dash.

## Database safety

Per the constraint, the two SQL migrations and the Drizzle schema entries were authored but **NOT applied**. `npm run db:migrate` was not run. DATABASE_URL may point at remote/prod Supabase, so applying `0016`/`0017` is a deliberate human step after review.

## Verification

- `npx tsc --noEmit -p apps/web/tsconfig.json`: zero errors in any plan file. The only 6 errors are pre-existing in `apps/web/tests/api-jarvis-tts.test.ts` (NextRequest typing, present on origin/main, unrelated to this work).
- `node --check tools/claude-code-sync.mjs`: passes.
- All five per-task `<verify>` automated checks pass (MIGRATIONS OK / ANTHROPIC USAGE OK / SUBSCRIPTION OK / SYNC OK / WIRING OK).

## Follow-up for the owner

1. **Admin key**: replace the workspace `ANTHROPIC_ADMIN_KEY` with a real Admin API key (`sk-ant-admin01-...`) so the Anthropic API spend chart fetches live. Until then the panel falls back to the (empty) table and shows an inline error.
2. **Apply migrations**: run `0016`/`0017` against the target DB before relying on the panels (the deliberate human DB step).
3. **Populate the subscription panel**: run `node tools/claude-code-sync.mjs` against the running app to write the session + weekly rows.
4. **Calibrate `MAX_5X_LIMITS`** in `apps/web/lib/integrations/claude-code/limits.ts` once you've eyeballed your real /usage caps; the seeded numbers are placeholders.
5. **Re-confirm the Cost API parser** against a real 200 response once the Admin key works (the current Zod shape is built from the documented shape, not a verified live body).

## Status

Tasks 1 to 5 complete and committed. Task 6 (blocking human-verify checkpoint) was intentionally NOT executed. The build is ready for the owner's visual verification per the plan's `<how-to-verify>` steps.

## Self-Check: PASSED
- All 7 created files exist on disk; all 7 modified files committed.
- All 5 task commits present in `git log`.
