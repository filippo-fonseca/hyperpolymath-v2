# Life Analytics tab on /insights — Research (REVISED, package-first)

**Researched:** 2026-06-07 (revision)
**Domain:** Personal-analytics surfaces (GitHub heatmap, Claude Code usage, Strava, Flow Pomodoro CSV)
**Branch:** `feature/lifeos-tab`
**Confidence:** HIGH on every USE pick (verified against npm + maintainer docs in last 60 days)

---

## Bias reset

Previous research recommended hand-rolling everything. The user explicitly pushed back: **lean on libraries where well-maintained ones exist**. I re-evaluated each integration with package-first bias. Three of four picks flipped to a library. The GitHub heatmap especially: `react-activity-calendar` v3 now exposes a `renderBlock` render prop and a fully overridable `theme`, which kills the original "rigid theming" objection.

---

## 1. Per-integration package shortlist

### 1.1 GitHub contribution heatmap

| Package | Version | Last publish | React 19? | Verdict | One-line reason |
|---|---|---|---|---|---|
| **react-github-calendar** | 5.0.6 | 2026-04-12 | `^18 \|\| ^19` peer | **USE** | Thin wrapper around react-activity-calendar that fetches the contribution data itself via jogruber's free public API — zero GitHub token, zero GraphQL plumbing, full `theme` + `renderBlock` + `transformData` props. |
| react-activity-calendar | 3.2.0 | 2026-04-15 | `^18 \|\| ^19` peer | reject (as a direct dep) | Already pulled in transitively by react-github-calendar; we get its props anyway. No reason to wire data ourselves. |
| @uiw/react-heat-map | — | — | — | reject | Generic heatmap, not a GitHub calendar; we'd re-implement month labels, weekday rows, ramp. |
| Hand-rolled SVG (prior recommendation) | — | — | — | reject | Was justified only when theming was assumed rigid. With `theme` + `renderBlock` it isn't. |

**Decisive fact:** react-github-calendar fetches via `https://github-contributions-api.jogruber.de/v4/<user>` (public, free, scrapes the GitHub profile page server-side). **We can ship the GitHub panel with no `GITHUB_TOKEN`, no GraphQL query, no PAT-management UX.** This is a real DX/setup win the user should know about.

Caveat: the public API has a published rate limit of **12 req/min for `cache-control: no-cache`** as of Jan 2026 — irrelevant for our use case (page-load with server-side cache).

### 1.2 Claude Code stats

| Package | Version | Last publish | Verdict | One-line reason |
|---|---|---|---|---|
| **ccusage** | 20.0.6 | 2026-05-29 | **USE** | Native ESM, exports `loadDailyUsageData` / `loadSessionData` / typed `DailyUsage`/`SessionUsage` from subpath `ccusage/data-loader`, handles pricing tables, cache vs fresh token math, schema drift. |
| Hand-rolled jsonl parser | — | — | reject | Would have to track 4 token types, hard-code Sonnet 4.6 pricing, chase schema changes. |
| claude-code-usage / anthropic-cli-stats | — | — | reject | Searched — no actively maintained alternatives. ccusage is the package in this niche. |

**Verified import shape (this is what flipped from "MEDIUM-HIGH" to HIGH):**
```ts
import { loadDailyUsageData, loadSessionData } from 'ccusage/data-loader';
import type { DailyUsage, SessionUsage } from 'ccusage/data-loader';
```
Note the **subpath** `ccusage/data-loader` — NOT the root `ccusage` entry (the root entry is the CLI). Earlier research was sloppy on this and would have caused an import miss.

Signature: `loadDailyUsageData(options?: { since?: string; until?: string; mode?: 'auto'|'calculate'|'display'; order?: 'asc'|'desc'; offline?: boolean; groupByProject?: boolean; claudePath?: string }) => Promise<DailyUsage[]>`

ESM-only (`"type": "module"` in package.json). Next.js 16 Server Components / Server Actions handle ESM natively — no transpile concern.

### 1.3 Strava

| Package | Version | Last publish | Verdict | One-line reason |
|---|---|---|---|---|
| **strava-v3** (UnbounDev/node-strava-v3) | 4.0.1 | 2026-02-26 | **USE** | Promise-based v3 wrapper, recently migrated to Axios, BigInt-safe IDs, rate-limit tracking, `oauth.refreshToken()` helper. Active (v4.0 within last 4 months). |
| @tokks/strava | — | — | reject | TypeScript wrapper with `on_token_refresh` callback — nicer DX, but smaller maintainer + lower download count. Not worth the bus-factor swap. |
| strava (newer "strava" pkg) | — | — | reject | Less mature than strava-v3 despite the cleaner name. |
| Plain `fetch` (prior recommendation) | — | — | reject | strava-v3 gives us BigInt-safe IDs and consistent error shapes for free; "I'll just fetch" usually costs more than the import. |

**Important honest caveat:** strava-v3 has `oauth.refreshToken(refreshToken)` but does NOT have an automatic on-refresh persistence hook. We still own writing the rotated refresh_token back to disk/DB. The library saves us from URL-building, response-shape boilerplate, and pagination — not from token persistence. That's a smaller win than "use a library and forget OAuth," but still net positive over raw fetch.

### 1.4 Flow Pomodoro CSV

| Package | Version | Verdict | One-line reason |
|---|---|---|---|
| **csv-parse** | 5.x | **USE** | The de-facto Node CSV lib. Sync API at `csv-parse/sync`. Searched "flow pomodoro stats parser" / "flow timer csv" — no Flow-app-specific library exists, so generic CSV is the right level. |

No surprises here vs prior research.

### 1.5 Visualization for Strava / Flow / Claude Code (NON-heatmap panels)

Confirmed user intent: **the heatmap is GitHub-only.** Strava + Claude + Flow get "different visualizations color-themed per source" — re-reading the original prompt, "different heat map" was loose language meaning "differently-themed panel," not "different heatmap viz." Confirmed by the user's later phrasing in the re-research brief: "column-charts for Strava/Flow and a heatmap only for GitHub." Honoring that.

Use existing **Recharts** (already in apps/web via `InsightsCharts.tsx`) — Bar/Line components, per-panel accent passed as hex literal. No new chart lib.

---

## 2. Final picks — install commands + minimal usage

```bash
cd apps/web
npm install react-github-calendar ccusage strava-v3 csv-parse
```

(`react-activity-calendar` lands transitively; do not list it.)

### 2.1 GitHub — react-github-calendar

```tsx
'use client';
import GitHubCalendar from 'react-github-calendar';

const ACCENT = '#216e39'; // GitHub fourth-quartile green
const theme = {
  light: ['var-fallback', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  dark:  ['#161b22',     '#0e4429', '#006d32', '#26a641', '#39d353'],
};

export function GithubContributionsPanel() {
  return (
    <section
      className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-6"
      style={{ ['--panel-accent' as string]: ACCENT }}
    >
      <h3 className="font-serif text-lg">GitHub contributions</h3>
      <GitHubCalendar
        username="filippo-fonseca"
        theme={theme}
        blockSize={11}
        blockMargin={3}
        blockRadius={2}
        fontSize={12}
        hideColorLegend
        hideTotalCount={false}
      />
    </section>
  );
}
```

Server fetch optional via `transformData` prop or pre-fetch in `page.tsx` and pass through `data`. For v1 the built-in client fetch (jogruber API) is fine — single page-load, public data, no token. If we want server-side caching, fetch `https://github-contributions-api.jogruber.de/v4/filippo-fonseca` in the server action and feed `transformData`.

### 2.2 Claude Code — ccusage

```ts
// lib/integrations/claude-code.ts
import 'server-only';
import { loadDailyUsageData, loadSessionData } from 'ccusage/data-loader';
import type { DailyUsage } from 'ccusage/data-loader';

export async function getClaudeCodeUsage(): Promise<Result<{
  last7Days: DailyUsage[];
  totalTokens7d: number;
  totalCost7d: number;
}>> {
  try {
    const since = isoNDaysAgo(7);
    const daily = await loadDailyUsageData({ since, order: 'asc' });
    return {
      ok: true,
      data: {
        last7Days: daily,
        totalTokens7d: daily.reduce((s, d) => s + (d.totalTokens ?? 0), 0),
        totalCost7d: daily.reduce((s, d) => s + (d.totalCost ?? 0), 0),
      },
    };
  } catch (e) {
    return { ok: false, error: { code: 'CLAUDE_UNKNOWN', message: String(e), recoverable: false } };
  }
}
```

### 2.3 Strava — strava-v3

```ts
// lib/integrations/strava.ts
import 'server-only';
import strava from 'strava-v3';

strava.config({
  client_id: process.env.STRAVA_CLIENT_ID!,
  client_secret: process.env.STRAVA_CLIENT_SECRET!,
  redirect_uri: 'http://localhost:3000', // unused in refresh-only flow
});

export async function getStravaActivity(userId: string) {
  const stored = await readTokens(userId); // from Supabase integration_tokens row
  let { access_token, refresh_token, expires_at } = stored;

  if (Date.now() / 1000 >= expires_at - 60) {
    const refreshed = await strava.oauth.refreshToken(refresh_token);
    access_token = refreshed.access_token;
    refresh_token = refreshed.refresh_token; // ROTATES — must persist
    expires_at = refreshed.expires_at;
    await writeTokens(userId, { access_token, refresh_token, expires_at });
  }

  const after = Math.floor(Date.now() / 1000) - 8 * 7 * 86400;
  const activities = await strava.athlete.listActivities({
    access_token, after, per_page: 100,
  });
  return { ok: true, data: { activities } };
}
```

### 2.4 Flow — csv-parse

```ts
// lib/integrations/flow.ts
import 'server-only';
import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function getFlowStats() {
  const file = process.env.FLOW_STATS_PATH ?? path.join(os.homedir(), 'Desktop', 'Flow-Stats.csv');
  try {
    const buf = await readFile(file, 'utf8');
    const rows = parse(buf, { columns: true, skip_empty_lines: true }) as Array<{
      Session: string; Started: string; Completed: string;
    }>;
    return { ok: true, data: rows };
  } catch (e: any) {
    const code = e.code === 'ENOENT' ? 'FLOW_CSV_NOT_FOUND' : 'FLOW_UNKNOWN';
    return { ok: false, error: { code, message: e.message, recoverable: code === 'FLOW_CSV_NOT_FOUND' } };
  }
}
```

---

## 3. Visual integration plan — how each library's theme hook maps to our register

### 3.1 react-github-calendar → `--panel-accent` + rounded-2xl chrome

- The `theme` prop takes a 5-stop hex array per light/dark mode. Use **GitHub's own ramp** (`#9be9a8 → #216e39` light; `#0e4429 → #39d353` dark) — matches what the user expects from "GitHub heatmap."
- `blockSize={11} blockMargin={3} blockRadius={2}` matches the visual cadence of `HabitsInsightsPanel`'s existing strip (`w-2 h-2 rounded-[2px]`) at a slightly larger primary-panel scale.
- `fontSize={12}` keeps month labels in the same typographic register as the other insights cards (which use Tailwind `text-xs` / `text-sm`).
- `hideColorLegend` — our chrome already implies the ramp via the panel-accent halo; no legend needed.
- Wrap in our existing rounded-2xl `bg-[var(--surface)] border border-[var(--edge)]` card. The calendar SVG inherits the dark canvas naturally — no extra theming.
- Per-panel accent (the halo glow on the card edge) uses `style={{ ['--panel-accent']: '#216e39' }}` exactly like prior research described. Library doesn't fight this — it owns only the inner SVG.

### 3.2 ccusage → Recharts in panel, same chrome pattern

ccusage returns plain data; we draw it with Recharts. No library-imposed visuals. Accent = `var(--ink-amber)` from existing globals.css. Same chrome as InsightsCharts.

### 3.3 strava-v3 → Recharts in panel

Same as ccusage — library is data-only. Accent `#FC4C02` scoped inline. Recharts Bar for 8-week distance, list for last 5 activities.

### 3.4 csv-parse → Recharts in panel

Data-only library. Accent `#a78bfa` (violet-400) scoped inline. 7-day weekday bar chart.

**Globals.css contract is unchanged.** No new tokens added. Every accent is panel-scoped via inline CSS variable + literal hex for Recharts strokes (the well-established `--var doesn't resolve in SVG` workaround already proven in `InsightsCharts.tsx`).

---

## 4. Updated env-var requirements

### Removed (vs prior research)

- ~~`GITHUB_TOKEN`~~ — not needed. react-github-calendar uses jogruber's public scraper API.
- ~~`GITHUB_USERNAME`~~ — hard-code `'filippo-fonseca'` as a prop. Single-user app.

### Still required

```bash
# Strava (one-time mint via tools/strava-mint-token.mjs)
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...      # seed; subsequent rotations persisted to Supabase
```

### Optional

```bash
FLOW_STATS_PATH=/Users/filippofonseca/Desktop/Flow-Stats.csv   # override default ~/Desktop path
```

### None needed

- Claude Code (ccusage reads `~/.claude/projects/` directly)
- GitHub contributions (jogruber API is public)

Net: **one fewer env-var category** to manage. Real win for the user-as-operator.

---

## 5. Diff vs old research — what changed and why

| Topic | Old verdict | New verdict | Why it flipped |
|---|---|---|---|
| GitHub heatmap rendering | Hand-rolled SVG with GraphQL backend | **react-github-calendar** (5.0.6) | Verified that `react-activity-calendar` v3 (which it wraps) now exposes `renderBlock` + full `theme` override + `blockSize/Margin/Radius`. The original "rigid theming" objection is stale by ~2 major versions. Adding 1 client component to ship a polished feature in 20 lines beats 40 lines of custom SVG we maintain forever. |
| GitHub auth | GraphQL PAT (`GITHUB_TOKEN` + `read:user` scope) | **No token** — public API used by the library | Library fetches via `github-contributions-api.jogruber.de/v4/<user>`, which scrapes the public profile page. We get the same data with zero token-mgmt UX. |
| Claude Code import path | `import { loadDailyUsageData } from 'ccusage/data-loader'` (correct) PLUS `import { calculateTotals, loadSessionData } from 'ccusage'` (wrong — that's the CLI entry) | **All loaders from `ccusage/data-loader` subpath** | Verified against ccusage docs. Root `ccusage` entry is the CLI; programmatic API lives at subpaths. Earlier guess would have produced an import error. |
| Strava transport | Plain `fetch` against `strava.com/api/v3/...` | **strava-v3 v4.0.1** | Library handles axios setup, response shape, BigInt IDs, rate-limit headers. Still requires us to persist rotated refresh_token — but the boilerplate floor is lower. |
| Flow CSV parsing | `csv-parse` | Unchanged — **csv-parse** | Confirmed no Flow-app-specific lib exists. |
| New dependencies | `ccusage`, `csv-parse` | **`react-github-calendar`, `ccusage`, `strava-v3`, `csv-parse`** | Two more libraries, all small, all on actively maintained tracks (last publish within ~3 months for each). |
| Bundle impact | Negligible (server-only deps) | Adds one client component (react-github-calendar + its react-activity-calendar dep). Tree-shaken; the calendar lib is ~20KB gzipped. Acceptable. |

---

## 6. Risks / open questions

1. **jogruber public API outage.** The GitHub panel becomes a hard dependency on a single third-party scraper. Mitigation: wrap the panel in our `Result<T>` error UI so an API outage produces a "GitHub data temporarily unavailable" state, not a page crash. Fallback path if outages become chronic: re-introduce GitHub PAT + GraphQL and feed `transformData` ourselves (the library supports it — we'd own the fetch, library still renders). Low probability; jogruber's API has been stable since ~2020.

2. **react-github-calendar is a client component.** Adds one `'use client'` boundary on the Life tab. The other three panels can stay server-rendered. Acceptable — we already have client components elsewhere in `/insights` (`InsightsTabs` is client). Server-side caching of the GitHub data would require feeding `transformData` ourselves; skip for v1.

3. **Theme array order in react-activity-calendar v3.** Theme is `[level0, level1, level2, level3, level4]` (5 stops including the empty cell). Easy to off-by-one. Verify visually on first render.

4. **strava-v3 refresh token rotation is our problem.** Library does NOT have an `on_token_refresh` callback like `@tokks/strava`. We MUST capture the rotated `refresh_token` from `oauth.refreshToken()` response and persist it before returning. Tested mitigation: integration unit test on the persistence write. Same caveat as old research; flagged again for emphasis.

5. **ccusage major version churn.** v20 within 60 days of v19. The library moves fast. Pin `^20.0.0` (no caret across majors) and add a startup sanity check: `if (typeof loadDailyUsageData !== 'function') return Result.error(...)`. If they bump to v21 with breaking changes, panel degrades gracefully instead of crashing the page.

6. **strava-v3 v4 migration verified, NOT inspected.** v4.0 went out Feb 2026; their README didn't show a CHANGELOG of breaking changes in WebFetch. Before writing the integration, read `node_modules/strava-v3/CHANGELOG.md` post-install to confirm `oauth.refreshToken` signature matches the code sample above.

7. **csv-parse subpath import.** Use `import { parse } from 'csv-parse/sync'` — NOT `csv-parse` root (that's async streaming). Easy to get wrong.

8. **GitHub heatmap colors in dark mode.** Library accepts separate `light` / `dark` theme arrays. Our app is dark-first; verify the dark ramp (`#0e4429 → #39d353`) reads well against `--surface`. Adjust at impl time, not now.

9. **The user said "different heat map" in the brief.** Re-confirmed: GitHub is the only heatmap panel; the other three are bar/line charts with per-source accent. If user actually wanted a heatmap-per-source (e.g., Strava activity by day), `react-activity-calendar` direct usage would handle that — but defer until requested.

---

## Sources (verified within last 60 days)

- [react-github-calendar on npm](https://www.npmjs.com/package/react-github-calendar) — v5.0.6 (2026-04-12), peer `react ^18 || ^19`, depends on `react-activity-calendar ^3.1.2`
- [react-activity-calendar on npm](https://www.npmjs.com/package/react-activity-calendar) — v3.2.0 (2026-04-15), peer `react ^18 || ^19`
- [grubersjoe/react-github-calendar](https://github.com/grubersjoe/react-github-calendar) — v5 release notes, uses jogruber's contributions API, FAQ confirms SSR pre-fetch path via `transformData`
- [grubersjoe/react-activity-calendar](https://github.com/grubersjoe/react-activity-calendar) — `renderBlock` + theme docs; SSR support for Next.js/Astro/Remix/Vite confirmed in README
- [grubersjoe/github-contributions-api](https://github.com/grubersjoe/github-contributions-api) — public scraper API, 12 req/min rate limit for `no-cache` requests (Jan 2026)
- [ccusage on npm](https://www.npmjs.com/package/ccusage) — v20.0.6 (2026-05-29), ESM-only (`type: module`)
- [ccusage Library Usage docs](https://ccusage.com/guide/library-usage) — `loadDailyUsageData` / `loadSessionData` from `ccusage/data-loader`; signatures + options verified
- [strava-v3 on npm](https://www.npmjs.com/package/strava-v3) — v4.0.1 (2026-02-26)
- [UnbounDev/node-strava-v3](https://github.com/UnbounDev/node-strava-v3) — README confirms `strava.oauth.refreshToken(token)`, BigInt-safe IDs, Axios migration, NO automatic persistence hook
- [Strava Authentication docs](https://developers.strava.com/docs/authentication/) — refresh-token rotation: old token invalidated on new issue
