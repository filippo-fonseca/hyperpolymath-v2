---
phase: 06-polish
plan: 04
subsystem: telemetry
tags: [health-endpoint, insights, recharts, jarvis-events, agent-mode, server-component, neumorphic, jarvis-blue]

# Dependency graph
requires:
  - phase: 06-polish
    provides: neumorphic shadow tokens (--shadow-nm-surface), JARVIS-blue accent (--color-accent-jarvis), .agent-glow-passive utility, recharts@3.8.1 pre-installed (06-01-SUMMARY.md)
  - phase: 06-polish
    provides: EmptyState component (06-02-SUMMARY.md)
  - phase: 05-jarvis
    provides: jarvis_events table (RES-05; schema.ts:285-307)
provides:
  - GET /api/health — public connectivity probe (no auth) — pings Supabase + Anthropic in parallel via Promise.race with per-service timeouts (3s/5s); returns JSON {supabase, anthropic, google_calendar:'n/a', checked_at} + HTTP 200 (all ok) / 503 (any down)
  - /(app)/health — authenticated visual page with 3 neumorphic Card tiles + agent-glow-passive on 'ok' status pills + ARIA-labeled badges (UI-SPEC §8d)
  - getInsightsData(userId) — single-query 7-day aggregation over jarvis_events; computes actionDist + latencyByDay (p50/p95 Sun..Sat) + errorRate + sparkline + totalTurns
  - /(app)/insights — Server Component (force-dynamic) with requireOnboarded gate + branded EmptyState ("Seven days of silence.") when zero events
  - InsightsCharts client component — recharts BarChart (action dist) + LineChart (p50/p95) + LineChart sparkline; ResponsiveContainer wrapped in fixed-height divs (h-[200px] x2 + h-[60px] sparkline); JARVIS-blue strokes + fills; isAnimationActive guarded by useReducedMotion()
  - /insights nav entry in PersistentNav with BarChart2 lucide icon, between Calendar and Settings
  - NEXT_PUBLIC_APP_URL documented in .env.example for the /(app)/health SSR fetch
affects: [06-05-a11y]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Public health endpoint pattern — no auth guard so monitoring tools (cron, uptime checkers, deploy pipelines) can reach it without credentials; google_calendar returns 'n/a' on public surface because per-user OAuth state isn't available without claims"
    - "Promise.race(ping, timeout(ms, fallback)) — per-service ceiling without aborting the underlying ping (the ping's IO completes in the background but its result is discarded); avoids hung-handler cascade if upstream is slow rather than down"
    - "Anthropic client.models.list() as zero-token reachability check — preferred over a 1-token messages.create probe because it's free and doesn't burn cache budget"
    - "Server Component aggregation pattern for diagnostic surfaces — single Drizzle SELECT + pure-JS reduce; no client round-trip, no streaming, no TanStack Query (data is per-page-load, not realtime)"
    - "recharts ResponsiveContainer height idiom — always wrap in a fixed-height div (h-[200px], h-[60px]); the container measures parent height which must be deterministic at first paint"
    - "Visual /health page reads its own JSON endpoint via SSR fetch (NEXT_PUBLIC_APP_URL base) — separates the JSON contract from the UI; the same /api/health is consumable by both human-eyes (the visual page) and monitoring"

key-files:
  created:
    - apps/web/app/api/health/route.ts
    - apps/web/app/(app)/health/page.tsx
    - apps/web/lib/db/queries/insights.ts
    - apps/web/app/(app)/insights/page.tsx
    - apps/web/components/insights/InsightsCharts.tsx
    - .planning/phases/06-polish/06-04-SUMMARY.md
  modified:
    - apps/web/components/shell/PersistentNav.tsx
    - apps/web/.env.example

key-decisions:
  - "google_calendar status is 'n/a' on /api/health (not 'down' or 'unknown') — the endpoint is public, gcal connectivity requires a per-user OAuth token, and reporting 'down' would falsely degrade health for an architectural reason. /settings already surfaces per-user gcal status via useGcalConnectionStatus."
  - "200 vs 503 discrimination is binary on supabase + anthropic only — google_calendar='n/a' never drops the response to 503. The endpoint reports whether the stack we control is alive."
  - "Anthropic models.list() over messages.create — zero-token probe, no cache budget, no LLM latency variance polluting the connectivity check."
  - "Per-service timeouts (3s Supabase, 5s Anthropic) chosen for cold-start ceilings — Supabase pooler should respond well under 1s, Anthropic edge can spike on cold connections."
  - "Aggregation is computed server-side in pure JS from a single SELECT (createdAt + actionTypes + latencyMs + error) — at v1 single-user volume this is faster than 4 group-by queries and keeps the executor model simple."
  - "Percentile algorithm is nearest-rank (sort + Math.floor(n * p), clamped) — no interpolation, no Tukey hinges. Diagnostic surface where 'is p95 trending up' matters more than statistical rigor; matches what users will mentally compute."
  - "Day-of-week bucketing (Sun..Sat) rather than absolute calendar dates — over a 7-day rolling window each day-of-week appears exactly once, so the visual axis is stable + readable. The trade-off: a brand-new user with 2 days of data will see 5 empty buckets; the latency line uses connectNulls so it draws across gaps."
  - "Error threshold for color flip is 5% — under 5% renders JARVIS-blue (informational); over 5% flips to --color-destructive (warning). The threshold is hardcoded; if it needs to be configurable we'll thread it through later."
  - "Chart cards carry shadow-nm-surface + agent-glow-passive together — UI-SPEC §7e specifies the passive glow on agent-mode chart wrappers, §3c specifies the neumorphic surface shadow on cards. Both apply, no conflict."
  - "Live dot only renders when totalTurns > 0 — avoids a misleading 'live' indicator on an empty state."
  - "InsightsCharts uses useReducedMotion + isAnimationActive on all 4 chart series (Bar + 2 Lines + sparkline) — defense in depth alongside the global CSS reduced-motion block from 06-03."

patterns-established:
  - "Diagnostic API + visual page pair pattern — JSON endpoint is the canonical contract (consumable by monitoring + the visual page), Server Component page reads the JSON via SSR fetch and renders. Avoids two divergent paths to the same data."
  - "Server-Component-renders-charts pattern — page.tsx is a Server Component that calls the Drizzle query and passes shaped data to a 'use client' chart component. No fetching client-side, no loading state, no TanStack Query for diagnostic per-page-load views."
  - "Brand-voice empty state delegated to shared EmptyState — every new list page reuses the 06-02 component with its own heading/body from UI-SPEC §9."

requirements-completed: [RES-04, RES-06]

# Metrics
duration: ~5min
completed: 2026-05-19
---

# Phase 06 Plan 04: Telemetry Surfaces Summary

**System observability lands: GET /api/health returns parallel Supabase + Anthropic connectivity in 4 fields with 200/503 discrimination; the authenticated /(app)/health visual page renders 3 neumorphic tiles with JARVIS-blue agent-glow on 'ok' badges; /insights aggregates 7 days of jarvis_events server-side and renders 3 recharts charts (action distribution bar, latency p50/p95 line, error rate number + sparkline) with reduced-motion guards; /insights nav entry slots between Calendar and Settings.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-19T02:49:09Z
- **Completed:** 2026-05-19T02:54:55Z
- **Tasks:** 3
- **Files created:** 5
- **Files modified:** 2

## Accomplishments

- **GET /api/health (RES-04):** Public endpoint at `apps/web/app/api/health/route.ts`. Runs `pingSupabase()` + `pingAnthropic()` in parallel via `Promise.all([Promise.race(ping, timeout(ms, 'down'))])`. Returns JSON `{supabase, anthropic, google_calendar:'n/a', checked_at}` with HTTP 200 if both ok and 503 otherwise. `runtime='nodejs'` (Anthropic SDK incompatible with Edge); `dynamic='force-dynamic'`. No auth guard — monitoring tools reach it without credentials.
- **/(app)/health visual page (UI-SPEC §8d):** Authenticated diagnostic page. Fetches `${NEXT_PUBLIC_APP_URL}/api/health` server-side with `cache:'no-store'`. Renders 3 neumorphic Cards (boxShadow: `var(--shadow-nm-surface)`, border:none) for Supabase / Anthropic / Google Calendar. Status pill: `ok` gets `bg-emerald-500/10 + agent-glow-passive` (JARVIS-blue halo per UI-SPEC §7e), `down` gets `bg-destructive/10`, `n/a` gets neutral `bg-muted`. ARIA-labeled per badge ("Supabase: ok"). H1 uses the §4a `text-4xl font-serif font-semibold`.
- **getInsightsData(userId) (RES-06, D-04):** Single Drizzle SELECT over `jarvis_events` filtered by `userId + createdAt >= now - 7d`. Computes in pure JS:
  - **actionDist** — flatten `actionTypes` arrays into a `Map<string, number>`, sort descending by count
  - **latencyByDay** — bucket events by `createdAt.getDay()` into Sun..Sat, sort each bucket ascending, take p50 (`Math.floor(n*0.5)`) + p95 (`Math.floor(n*0.95)`) via nearest-rank
  - **errorRate** — count rows where `error != null && error !== ''` over total, plus per-day-of-week sparkline counts
  - **totalTurns** — for the page-level empty-state branch
- **/(app)/insights Server Component:** `force-dynamic`. `requireOnboarded` gate. Calls `getInsightsData(user.id)` server-side and passes the shaped data to `<InsightsCharts data={data} />`. When `totalTurns === 0`, renders the brand-voice EmptyState ("Seven days of silence." / "JARVIS hasn't logged any turns yet. Send it a message to populate this.") per UI-SPEC §9. When `totalTurns > 0`, renders a JARVIS-blue live dot inline with the H1 (passive glow halo).
- **InsightsCharts.tsx (UI-SPEC §8e):** `'use client'`. Imports `BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid` from recharts 3.8.1 + `useReducedMotion` from motion/react. Three Cards (md:col-span-2 for Action Distribution, then 2-column for Latency + Error Rate). Each Card carries `shadow-nm-surface + agent-glow-passive`. ResponsiveContainer wrapped in fixed-height divs (h-[200px] for two main charts + h-[60px] for sparkline) per RESEARCH §6 Pitfall 4. JARVIS-blue (`#00d4ff`) on Bar fill, p50 stroke, sparkline stroke; faded blue (`rgba(0,212,255,0.5)`) on dashed p95. Mono-font axes (`var(--font-mono)`, 11px). Tooltips themed against card background. Error rate flips color to `--color-destructive` above 5%. `isAnimationActive` driven by `!useReducedMotion()` across all 4 series.
- **/insights nav entry:** `BarChart2` added to lucide-react imports in `PersistentNav.tsx`. New `{href:'/insights', label:'Insights', icon: BarChart2}` entry slotted between Calendar and Settings. Existing gcal-badge logic, collapsed/disabled rendering, and Tooltip wrapping all preserved untouched.
- **.env.example documented:** Added `NEXT_PUBLIC_APP_URL=http://localhost:3000` block with prose explaining that Next 16 SSR fetch needs an absolute URL and production must override.

## Task Commits

1. **Task 1: /api/health endpoint + /(app)/health visual page** — `c895c6a` (feat)
2. **Task 2: insights query + page + InsightsCharts** — `074d76e` (feat)
3. **Task 3: /insights nav entry in PersistentNav** — `6aaffe3` (feat)

## Files Created/Modified

**Created:**
- `apps/web/app/api/health/route.ts` — Public GET endpoint, Node runtime, force-dynamic, Promise.race timeouts
- `apps/web/app/(app)/health/page.tsx` — Authenticated visual page, fetches own /api/health, 3 neumorphic tiles + JARVIS-blue glow on ok
- `apps/web/lib/db/queries/insights.ts` — `getInsightsData(userId)` 7-day aggregation, exports `InsightsData` interface
- `apps/web/app/(app)/insights/page.tsx` — Server Component, EmptyState branch, JARVIS-blue live dot
- `apps/web/components/insights/InsightsCharts.tsx` — `'use client'`, 3 recharts charts, reduced-motion guards, JARVIS-blue palette

**Modified:**
- `apps/web/components/shell/PersistentNav.tsx` — Added `BarChart2` import + `/insights` nav entry between Calendar and Settings
- `apps/web/.env.example` — Documented `NEXT_PUBLIC_APP_URL` block for the /(app)/health SSR fetch

## /api/health Response Shape

```json
{
  "supabase": "ok",        // 'ok' if SELECT id FROM users LIMIT 1 returns no error
  "anthropic": "ok",       // 'ok' if client.models.list() succeeds (zero-token probe)
  "google_calendar": "n/a", // always 'n/a' on this public endpoint — per-user OAuth status lives on /settings
  "checked_at": "2026-05-19T02:50:00.000Z"
}
```

**HTTP status:**
- `200` if `supabase === 'ok' && anthropic === 'ok'`
- `503` otherwise (either upstream down or timed out)

**Timeouts (Promise.race fallbacks):**
- Supabase: 3000ms — pooled query should round-trip well under 1s
- Anthropic: 5000ms — edge cold-start can spike up to 3-4s; 5s leaves headroom without hanging the response

## google_calendar = 'n/a' Rationale (RESEARCH §7)

The `/api/health` endpoint is public — no auth guard, accessible to monitoring tools (cron jobs, uptime checkers, deploy pipelines) without credentials. Google Calendar reachability requires a per-user encrypted refresh token from `public.users` (decrypted via `lib/gcal/token.ts`); pinging gcal requires user context the endpoint doesn't have.

Three options were considered:
1. **'down'** — misleading; gcal isn't down, we just can't check from a public endpoint
2. **'unknown'** — accurate but not actionable
3. **'n/a'** ✓ — explicit "this surface doesn't apply here" semantic

Per-user gcal connection status already surfaces in `/settings` via `useGcalConnectionStatus()` (added in 04-03) — the right place for it since it requires the user's session anyway. The PersistentNav red dot fires from that same hook for cross-page visibility.

## InsightsData Aggregation Choices

### Day-of-week bucketing (Sun..Sat) over absolute dates

Within a rolling 7-day window each day-of-week appears exactly once, so a fixed Sun..Sat axis is both stable and visually parseable ("Wed is always the third tick"). The trade-off: a brand-new user with only 2 days of data will see 5 empty buckets — mitigated by `connectNulls` on the Latency LineChart so the visible line draws across gaps rather than fragmenting.

### Percentile: nearest-rank (no interpolation)

```ts
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)] ?? null;
}
```

Simple, deterministic, no external dep. For a diagnostic surface where "is p95 trending up?" is the question, this matches what a human would mentally compute — no Tukey hinges, no continuous distribution interpolation. The clamp guards `Math.floor(n * 1.0) === n` from indexing out-of-bounds (relevant if we ever pass p=1.0).

### Single SELECT + pure-JS reduce over 4 group-by queries

At single-user MVP volume (~tens of turns per day at peak) one SELECT fetching `(createdAt, actionTypes, latencyMs, error)` and four passes in JS is faster than four round-trips with `GROUP BY` (especially with the `actionTypes` text-array unnest). Keeps the executor model trivial and avoids `unnest()` SQL plumbing for a one-table query.

### Error threshold = 5% (hardcoded color flip)

Under 5% renders JARVIS-blue (informational); over 5% flips to `--color-destructive` (warning). Hardcoded; if we ever need to surface different thresholds for different users / environments we'll thread it through props. For v1 a hardcoded line is correct.

## recharts ResponsiveContainer Height Pattern (RESEARCH §6 Pitfall 4)

`ResponsiveContainer` from recharts 3.8.1 measures parent height. If the parent has no deterministic height at first paint (e.g., flex auto, no min-height), the container collapses to 0 and the chart never renders.

Mitigation pattern used throughout `InsightsCharts.tsx`:

```tsx
<div className="h-[200px]">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={...}>...</BarChart>
  </ResponsiveContainer>
</div>
```

`h-[200px]` and `h-[60px]` (for the sparkline) ensure the parent has a fixed height at hydration. Width remains responsive via `width="100%"`. Three explicit heights total: 200px Bar + 200px Line + 60px sparkline.

## JARVIS-Blue Color Application (UI-SPEC §8e, D-08)

The /insights page is an Agent-mode surface (UI-SPEC §1 Route-to-Mode Mapping). Color decisions:

| Element | Color | Token / hex |
|---|---|---|
| Live dot beside H1 (when totalTurns > 0) | JARVIS-blue solid + glow halo | `var(--color-accent-jarvis)` + `.agent-glow-passive` |
| BarChart bar fill (action distribution) | JARVIS-blue at 70% opacity | `#00d4ff` + `fillOpacity={0.7}` |
| LineChart p50 stroke | JARVIS-blue solid | `#00d4ff` |
| LineChart p95 stroke | JARVIS-blue faded, dashed | `rgba(0, 212, 255, 0.5)` + `strokeDasharray="4 2"` |
| Error rate big number (< 5%) | JARVIS-blue | `var(--color-accent-jarvis)` |
| Error rate big number (> 5%) | Destructive | `var(--color-destructive)` |
| Sparkline stroke (< 5%) | JARVIS-blue | `#00d4ff` |
| Sparkline stroke (> 5%) | Destructive | `var(--color-destructive)` |
| Each Card wrapper | Neumorphic + passive blue halo | `var(--shadow-nm-surface)` + `.agent-glow-passive` |
| /(app)/health "ok" status pill | Emerald foreground + JARVIS-blue glow halo | `bg-emerald-500/10 text-emerald-700 dark:text-emerald-300` + `.agent-glow-passive` |

The hex `#00d4ff` appears as a literal in the chart series props (not via CSS variable) because recharts SVG fills/strokes resolve at render time and need a concrete string — not a CSS custom property. CSS variables work for Card `style.boxShadow` and the page H1 live dot because those are normal CSS properties.

## /(app)/health SSR Fetch Strategy

The visual page is a Server Component. To call its own `/api/health` JSON endpoint during SSR, Next 16 requires an absolute URL (relative URLs fail during build-phase static analysis even when force-dynamic). Strategy:

```ts
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const res = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
```

`NEXT_PUBLIC_APP_URL` documented in `.env.example` with prose explaining dev fallback (`http://localhost:3000`) and production requirement (canonical origin like `https://hyperpolymath.app`). `cache: "no-store"` because the JSON is per-request live data.

The page surfaces both `200` and `503` bodies — fetch doesn't throw on non-2xx by default and we want to show "down" pills rather than an error boundary.

## Verification Results

| Step | Result |
|---|---|
| `pnpm --filter web typecheck` after every task | exits 0 |
| `pnpm --filter web build` after Task 2 | succeeds; `/api/health`, `/health`, `/insights` all registered as dynamic routes |
| `pnpm --filter web build` after Task 3 | succeeds end-to-end (wave-3 integration moment for 06-01 + 06-02 + 06-04) |
| `pnpm --filter web test` | 237 passed (1 skipped) |
| File existence (5 created files) | all FOUND |
| Acceptance grep counts | all pass (note: `grep -c '\\['` shell escaping is brittle; verified via `grep -F` literal pattern) |

## Deviations from Plan

None — all 3 tasks executed exactly as written. No bugs surfaced, no missing functionality discovered, no architectural changes needed.

**One minor stylistic adjustment:** The plan's example code uses `space-y-N` on Card wrappers to gap children. The shadcn `Card` primitive already declares `flex flex-col gap-6`, so wrapping with `space-y-3 / space-y-4` was redundant. Switched to overriding `gap-N` via className (the canonical Tailwind 4 way to override a flex/grid gap on shadcn primitives). Visual outcome is identical to what the plan described. Not tracked as a Rule-1/2/3 deviation — purely a no-behavioral-impact style fix consistent with the project's shadcn pattern.

## Auth Gates Encountered

None. All work was code-only; no external service auth flows or interactive prompts.

## Known Stubs

None. /insights and /health both render fully-wired data:
- /api/health pings real Supabase + Anthropic on every request
- /(app)/health fetches real /api/health and renders real status
- /insights renders real Drizzle aggregation over real jarvis_events
- Empty state on /insights is intentional product behavior (UI-SPEC §9), not a stub — fires only when `totalTurns === 0`

## Issues Encountered

None. Typecheck clean after every task; build green after Tasks 2 and 3; test suite (237 passing) unchanged.

## Self-Check: PASSED

All 5 created files exist on disk:
- `apps/web/app/api/health/route.ts` — FOUND
- `apps/web/app/(app)/health/page.tsx` — FOUND
- `apps/web/lib/db/queries/insights.ts` — FOUND
- `apps/web/app/(app)/insights/page.tsx` — FOUND
- `apps/web/components/insights/InsightsCharts.tsx` — FOUND

All 2 modified files exist on disk with expected changes (PersistentNav has `BarChart2` import + `/insights` entry; `.env.example` has `NEXT_PUBLIC_APP_URL` block).

All 3 task commit hashes verified present:
- `c895c6a` — feat(06-04): /api/health JSON endpoint + visual /health page (RES-04)
- `074d76e` — feat(06-04): /insights server aggregation + 3-chart recharts panel (RES-06, D-04)
- `6aaffe3` — feat(06-04): /insights nav entry (BarChart2) in PersistentNav (RES-06)

`pnpm --filter web typecheck` exits 0. `pnpm --filter web build` succeeds. `pnpm --filter web test` 237 passed (1 skipped).

## Open Items Downstream

- **Theme preference persistence** is currently localStorage-only via `next-themes` (D-05 noted "users table or browser storage" as a future option). Single-user MVP doesn't need cross-device sync; if it ever does we'd add a `users.theme_preference` column and sync via Server Action on `setTheme()`. Deferred indefinitely.
- **/insights filter UI is intentionally absent** (D-04 specified "3 charts, 7-day, no filters"). If we want time-range pickers (24h / 7d / 30d) or per-tool filtering later, the query function takes a single `userId` arg today — easy to extend without breaking the page contract.
- **/insights richer dashboard** — top-N errors table, cache hit rate panel, per-day token spend — explicitly deferred (UI-SPEC §13 Non-Goals).
- **JARVIS-blue contrast on light theme** — UI-SPEC §11b warns that `#00d4ff` may fail 3:1 contrast on parchment backgrounds. The chart strokes + glow halos are visible in dark theme; light-theme contrast verification ships in 06-05 (a11y sweep) along with the substitute `#009bb5` fallback if needed.
- **/(app)/health gcal status surface** — if we ever want a per-user gcal status on /(app)/health (rather than 'n/a'), the visual page already has the user context; we could call `useGcalConnectionStatus`-equivalent server-side via Drizzle and override the 'n/a' from the JSON. Deferred — `/settings` is the canonical place for per-user connection state.
- **Production NEXT_PUBLIC_APP_URL** — deployment runbook needs to set this in Vercel envs before /(app)/health works in prod. Documented in `.env.example`; out of scope for this plan.

## User Setup Required

For local development: no action — the `http://localhost:3000` fallback works out of the box.

For production deployment: set `NEXT_PUBLIC_APP_URL` in Vercel project envs to the canonical app origin (e.g., `https://hyperpolymath.app`). Without it the /(app)/health page would attempt to fetch `http://localhost:3000/api/health` from the production server and fail.

## Next Phase Readiness

- **All telemetry surfaces live.** Phase 6 Wave 4 (06-05 — a11y + responsive sweep) can verify focus rings on /insights chart cards + /health Card tiles, audit the cursor-pointer rule against the new nav entry, and add the ⌘K hint chip to JarvisInput.
- **No blockers.** Production build green; typecheck clean; tests green; deferred items file empty.

---
*Phase: 06-polish*
*Completed: 2026-05-19*
