---
phase: quick/260607-h2k-life-analytics-life-tab-on-insights-github-strava-claude-code-flow
plan: 01
completed: 2026-06-07
branch: feature/lifeos-tab
---

# 260607-h2k — Life Analytics Tab on /insights — Summary

Ship a third "Life" tab on `/insights` with four panels: GitHub contributions
heatmap, Claude Code usage, Strava activity, Flow Pomodoro week chart. Per-panel
accent scoping via inline `--panel-accent`. Per-panel error isolation via a
shared `Result<T>` discriminated union. `globals.css` untouched.

## Files Created / Modified

| File | Commit | Purpose |
| --- | --- | --- |
| `apps/web/lib/db/schema.ts` | `e4e4004` | + `integrationTokens` table (composite PK user_id + provider) |
| `apps/web/drizzle/0010_integration_tokens.sql` | `e4e4004` | Hand-written migration (filename deviation — see Deviations) |
| `tools/strava-mint.mjs` | `8fea7cd` | Interactive Strava OAuth → Supabase bootstrap CLI |
| `apps/web/package.json` + `pnpm-lock.yaml` | `78f04f7` | + react-github-calendar, ccusage@^20, strava-v3, csv-parse |
| `apps/web/.env.local.example` | `78f04f7` | New file documenting STRAVA_CLIENT_ID/SECRET + flow path override |
| `apps/web/lib/integrations/result.ts` | `37fd1a7` | Shared `Result<T>` contract |
| `apps/web/lib/integrations/claude-code/usage.ts` | `d40f548` | ccusage data layer (CLI subprocess — deviation) |
| `apps/web/lib/integrations/strava/activities.ts` | `734dc70` | Strava data layer with refresh-token rotation persistence |
| `apps/web/lib/integrations/flow/sessions.ts` | `ff93de3` | Flow CSV parser + `bucketByDayForWeek` helper |
| `apps/web/components/insights/life/GithubHeatmapPanel.tsx` | `9eeab7d` | react-github-calendar wrapper (~50 lines, jogruber proxy) |
| `apps/web/components/insights/life/ClaudeCodePanel.tsx` | `ef12f50` | 30-day BarChart, amber accent |
| `apps/web/components/insights/life/StravaPanel.tsx` | `bafe80a` | 4-week BarChart + 3 recent activities, #FC4C02 |
| `apps/web/components/insights/life/FlowPanel.tsx` | `8ab4ca6` | Week-flip BarChart, #7c3aed |
| `apps/web/components/insights/life/LifeTabPanel.tsx` | `b1e9b10` | 4-panel composition (GitHub + Flow full-width rows) |
| `apps/web/components/insights/InsightsTabs.tsx` | `8e9a927` | + `"life"` tab option |
| `apps/web/app/(app)/insights/page.tsx` | `5312cad` | + 3 server-side data calls in Promise.all |

14 atomic commits on `feature/lifeos-tab` (e4e4004 → 5312cad). No push.

## Result<T> Contract

```typescript
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
```

Every server integration returns `Result<T>` and never throws. Page-level
`Promise.all` wraps each call in a belt-and-suspenders `.catch` so even a
runaway uncaught throw cannot kill the page.

## Per-Panel Accent Table

| Panel        | Color        | Scoping mechanism |
| ------------ | ------------ | ----------------- |
| GitHub       | `#2da44e` (theme ramp `#0d1117 → #2da44e`) | Inline `--panel-accent` on section root; ramp passed to `<GitHubCalendar theme>` |
| Claude Code  | `var(--ink-amber)` halo, `#d97706` recharts fill | Inline `--panel-accent`; literal hex for recharts (cannot resolve var()) |
| Strava       | `#FC4C02` | Inline `--panel-accent` |
| Flow         | `#7c3aed` | Inline `--panel-accent` |

`globals.css` diff since 8ec3324 (branch tip pre-plan): **0 lines** — no new tokens introduced.

## Task 0 — ccusage Export Shape Verification

```
$ cd apps/web && node -e "import('ccusage/data-loader').catch(e => console.error(e.message))"
Cannot find module '.../node_modules/ccusage/data-loader' imported from .../[eval]

$ cat node_modules/.pnpm/ccusage@20.0.6/node_modules/ccusage/package.json
{
  "name": "ccusage",
  "version": "20.0.6",
  ...
  "type": "module",
  "bin": { "ccusage": "./dist/cli.js" }
  // no "main", no "exports", no "module" field
}
```

**ccusage v20 ships as a CLI ONLY.** No library API; no `exports` map; no
`data-loader` subpath. This is a hard upstream API change from the v19-era
library import the plan was written against. Per the plan's Task 0 fallback
clause, the integration falls back to `child_process.execFile('npx', ['ccusage',
'daily', '--json', ...])` and parses the structured JSON.

## Strava Bootstrap Recipe

```bash
# 1. Register an app at https://www.strava.com/settings/api
# 2. Add to apps/web/.env.local:
#      STRAVA_CLIENT_ID=...
#      STRAVA_CLIENT_SECRET=...
# 3. Mint the first refresh token:
USER_ID=<your-auth-user-uuid> node tools/strava-mint.mjs

# Re-run is idempotent (upserts on user_id+provider).
```

## Deviations from Plan

1. **[Rule 1 — Bug] ccusage v20 has no library API.** Plan D-02/D-10 mandated
   `import { loadDailyUsageData } from 'ccusage/data-loader'`. v20.0.6 has no
   `exports` and no `data-loader` subpath. Per the plan's explicit Task 0
   fallback ("If no equivalent exists at all, fall back to consuming the CLI
   via child_process — last resort; document the deviation in SUMMARY"), the
   integration shells out to `npx ccusage daily --json`. Pinning at `^20.0.0`
   so a future minor that re-exposes a library API can be picked up via a
   single-file rewrite.

2. **[Rule 3 — Blocking] drizzle-kit generate fails with `Do not know how to
   serialize a BigInt`.** Pre-existing bug in drizzle-kit 0.28.1 triggered by
   the `users.state_version` bigint default. Walked around by hand-writing
   the migration SQL (`apps/web/drizzle/0010_integration_tokens.sql`) following
   the format of `0008_waitlist.sql`. Filename uses next available ordinal
   (`0010_`) rather than plan's suggested `0001_` (collides with existing
   migration). `db:migrate` not run — local Supabase isn't up, and the plan
   explicitly noted not to run it.

3. **[Rule 1 — Bug] `react-github-calendar` v5 API changes.** Plan code used
   `import GitHubCalendar from ...` and `hideColorLegend` / `hideTotalCount`
   props. v5.0.6 exports a *named* `GitHubCalendar` (no default export) and
   renamed props to `showColorLegend` / `showTotalCount` (positive form).
   Fixed inline.

4. **[Rule 1 — Bug] recharts Tooltip formatter typing strictness.** recharts
   3.8.1 has narrower formatter generics than the plan snippet assumed; cast
   tuples explicitly and loosened formatter callback signatures. No runtime
   impact.

5. **No `apps/web/.env.local.example` existed.** Plan said "create if missing" —
   it was missing; created with `git add -f` since `apps/web/.gitignore`
   matches `.env*`. Includes the full block from the plan with a one-line
   note that the ccusage import path landed as a CLI fallback per (1) above.

## Confirmation Set

- `globals.css` diff from branch start: empty (verified `git diff 8ec3324..HEAD -- apps/web/app/globals.css | wc -l → 0`).
- `package.json` adds exactly: `react-github-calendar`, `ccusage`, `strava-v3`, `csv-parse`.
- No `GITHUB_TOKEN` reference in any Life-tab code. Pre-existing references
  in `components/landing/lib/fetchCommits.ts` are out of scope for this plan.
- `tsc --noEmit` ends with **6 errors** — all in `tests/api-jarvis-tts.test.ts`,
  all pre-existing on the merged branch, all `Request` vs `NextRequest` typing
  drift. **Zero new errors.**

## Out-of-Scope (reaffirmed)

- Strava upload UI for fresh activities
- Flow CSV upload UI
- Dark-mode color tuning beyond inline accent
- Mobile-specific layout
- URL-persisted Flow week state (D-07 → useState only)
- RLS policies on `integration_tokens` (single-user MVP)
- Server-side caching of GitHub contributions via `transformData`

## Known Prod Limitations

- ccusage panel and Flow panel both require local fs (`~/.claude/projects/`
  and `~/Desktop/Flow-Stats.csv` respectively). On Vercel these will render
  their inline `Couldn't load` state. Acceptable per plan §out_of_scope.
- GitHub heatmap uses the public jogruber proxy. Single-user app — the
  12 req/min rate limit is not a concern.

## Library Dependency Surface

| Package                | Version | Boundary | Notes |
| ---------------------- | ------- | -------- | ----- |
| `react-github-calendar`| ^5.0.6  | Client component | Named import; props are `show*` not `hide*` in v5 |
| `ccusage`              | ^20.0.6 | CLI subprocess (server-only) | v20 dropped the library API entirely |
| `strava-v3`            | ^4.0.1  | Server-only | No `on_token_refresh` callback — we own rotation persistence |
| `csv-parse`            | ^6.2.1  | Server-only | Sync `csv-parse/sync` import |

## v2 Follow-ups

- Real "Reconnect Strava" button in StravaPanel that triggers the mint flow
  (currently the panel only displays the CLI command to run).
- Server-side GitHub caching via `transformData` + Vercel Edge KV if jogruber
  outages mount.
- URL-persisted Flow week state (currently `useState` only per D-07).
- Watch for ccusage minor releases that re-expose a library API — would
  collapse the subprocess layer to a one-file rewrite.

## Self-Check: PASSED

- All 14 task commits present in `git log` (e4e4004 → 5312cad).
- All 15 plan-mandated files exist on disk.
- `tsc --noEmit` clean except 6 pre-existing baseline errors in
  `tests/api-jarvis-tts.test.ts` (unchanged count).
- `globals.css` untouched.
