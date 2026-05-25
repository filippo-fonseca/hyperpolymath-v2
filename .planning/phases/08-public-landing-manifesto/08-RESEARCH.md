# Phase 8: Public Landing Manifesto — Research

**Researched:** 2026-05-25
**Domain:** Public marketing surface — Next.js 16 App Router static-ish landing page with one Server Component data feed (GitHub commits via ISR), one build-time roadmap parse, one anonymous-write Supabase table (waitlist), and a Motion-driven JARVIS demo animation.
**Confidence:** HIGH on the architectural questions (#1, #2, #3, #4 have load-bearing recommendations grounded in repo conventions + current 2026 docs). MEDIUM on Motion typing pattern (#5 — multiple viable idioms, recommendation given) and FRAMEWORK.md outline (#6 — judgment call, exemplar-driven).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 through D-13 — research these, NOT alternatives)

**Demo Modality**
- **D-01:** JARVIS centerpiece is a **pure CSS/Motion replay animation** of the README ASCII block. Cursor types the input verbatim ("dinner with anna 8pm saturday. buy her flowers friday afternoon"), then receipts stream in below. No API call, no auth, zero runtime cost.
- **D-02:** Respect `prefers-reduced-motion` — when set, render the final state directly with no animation.
- **D-03:** Two or three example sentences rotate (different action mixes — single task, multi-action, capture-only). Rotation is client-side: visitor clicks "▶ show another" → next canned example. Drafted in plan-phase, reviewed by user before execute.

**Page Density**
- **D-04:** **Sparse manifesto density.** Each section is 1-3 sentences plus one visual element. Total read time target: 60-90 seconds top-to-bottom.
- **D-05:** **One exception: The Engine section** gets a paragraph + the actual JSON contract shown — one real input → real schema-conforming JSON output, copied from a `jarvis-core` test fixture.

**Fork-Door Depth**
- **D-06:** Ship a new **`FRAMEWORK.md`** at repo root next to `README.md` that explicitly names the polymath-OS primitives: Areas, Projects (incl. Classes), Captures, JARVIS (agent contract), Calendar (gcal as source of truth).
- **D-07:** Landing's "Fork it" door is a single link to the GitHub repo. **No `/manifesto` or `/framework` route on the site itself.**
- **D-08:** "The Primitives" section renders as a small spec table — primitive name, one-line description, anchor link to corresponding section in `FRAMEWORK.md` on GitHub.

**Build-Log Source & Freshness**
- **D-09:** **Hybrid model:** Current phase + status parsed from `.planning/ROADMAP.md` at **build time**. Last 5-7 commits pulled from `api.github.com/repos/filippo-fonseca/hyperpolymath-v2/commits` via Server Component with **ISR `revalidate: 600`** (10 min).
- **D-10:** **Graceful degradation:** if GitHub fetch fails, render only the roadmap-derived phase line — never break the page.
- **D-11:** **"Shipped this week" line** computed at build/ISR time from the commit list (filter to commits with `feat(`/`fix(` prefix within last 7 days).

**Sign-In Door**
- **D-12:** **"Use it" door is a waitlist.** Email capture stored in a new `waitlist` table (`id`, `email`, `note` nullable, `createdAt` — no `userId`). Submit shows confirmation, optional one-line "what do you do?" follow-up.
- **D-13:** Real Google OAuth sign-in flow (`/sign-in`) preserved and accessible via a quieter "Already have an account? →" link under the waitlist form.

### Claude's Discretion
- Visual treatment specifics (ornament dividers, drop caps, paragraph rhythm, exact cyan accent placement) — **answered by 08-UI-SPEC.md (APPROVED)**; planner inherits the contract verbatim. No room for further discretion on visuals.
- Microcopy for each section heading and body — **frozen in UI-SPEC §9 "Copywriting Contract" table** verbatim. Planner uses those strings; no rewrites.
- The exact 2-3 rotating demo sentences for D-03 — **frozen in UI-SPEC §7c** (Example A: canonical README; Example B: capture-only `#idea polymathy as a competitive advantage`; Example C: `$ANTH 2480 p2` task with implicit date).
- Footer composition — **frozen in UI-SPEC §8b** (3 columns + ornament + sign-off).
- Whether cyan accent appears at all — **frozen in UI-SPEC §4**: cyan on exactly 2 component files (JarvisDemo, EngineSection) in 4 specific elements total. Anywhere else is a contract violation per UI-SPEC §11a grep gate.

### Deferred Ideas (OUT OF SCOPE — do not research, do not include in plan)
- Interactive JARVIS playground (visitor types own sentence against real Sonnet 4.6)
- `/manifesto` or `/about` separate longform route
- Dynamic OG image generation (`@vercel/og`) — ship a static 1200×630 image
- Analytics / pageview tracking (Plausible, Vercel Web Analytics)
- A/B testing thesis copy
- "Hide the sign-in door entirely" alternative (purer Karpathy stance)
- Stretch JARVIS items from backlog 999.2 (proactive briefings, anticipatory nudges)
</user_constraints>

---

## Phase Requirements

This phase introduces requirements rather than consuming existing ones. The 9 ROADMAP success criteria (SC-1..SC-9) below stand in for REQ-IDs until the planner formalizes them. Mapping to research findings:

| ID | Description (verbatim from ROADMAP) | Research Support |
|----|-------------------------------------|------------------|
| SC-1 | Visiting `/` while signed-out renders the manifesto landing; visiting while signed-in redirects to `/today` | §Open Q #8 (route group strategy) — keep `page.tsx` conditional render; do NOT move app into `(public)` group |
| SC-2 | Page renders all six sections in a single scroll: Thesis · Live JARVIS Demo · The Primitives · The Engine · The Choice · Build Log | UI-SPEC §5 already specifies; research adds no new constraints |
| SC-3 | JARVIS demo animates the README ASCII block (typed input → routed action receipts stream in) on first paint without layout shift; respects `prefers-reduced-motion` | §Open Q #5 (Motion 12 typing pattern) |
| SC-4 | The Primitives section names Areas / Projects / Captures / JARVIS / Calendar as a small spec table | UI-SPEC §5c covered; research §FRAMEWORK.md outline (#6) names anchor structure |
| SC-5 | The Engine section explains Claude Sonnet 4.6 + Strict Tool Use + one real input→JSON contract | Section §Engine fixture below — flags that `packages/jarvis-core/tests/strict-tool-use.fixture.ts` does **not exist** and must be created |
| SC-6 | Build-log section pulls last N commits from `main` live (not hardcoded) plus current phase + "shipped this week" stub; degrades gracefully if data source unreachable | §Open Q #2 (GitHub API auth) + §Open Q #3 (reading ROADMAP.md) |
| SC-7 | The Choice section presents two equally-weighted doors: "Use it" (sign-in / waitlist) and "Fork it" (GitHub repo + framework write-up) | §Open Q #4 (anonymous Supabase writes) |
| SC-8 | Passes the Phase 6.1 restraint check — no HUD-heavy chrome, JARVIS as ATMOSPHERIC mood only; Anthropic-level interaction polish; Notion document discipline | UI-SPEC §11a is the literal gate; research adds no new constraints |
| SC-9 | Lighthouse ≥ 95 (performance, accessibility, best-practices) on the landing route; no console errors; renders correctly with JS disabled (graceful degradation of the demo animation) | §Lighthouse + No-JS pitfalls section |

---

## Summary

The landing page is **architecturally cheap** — six sections, one client component (the demo), one Server Component with ISR (build-log GitHub fetch), one build-time file read (ROADMAP.md), one Server Action (waitlist insert), one new Drizzle table with one new RLS pattern (anonymous insert). The interesting work is **discipline**, not engineering complexity. The UI-SPEC is already approved and is the source of truth for everything visual; this research answers the load-bearing architectural questions the planner needs.

**Primary recommendations on the 8 open questions:**

1. **ISR in App Router (Q1):** export `revalidate = 600` from `BuildLog.tsx` Server Component (NOT from `page.tsx` — preserves root-route auth check as dynamic). Use `fetch(url, { next: { revalidate: 600 } })` per-call for the GitHub call; the route-segment export covers everything else statically.
2. **GitHub API auth (Q2):** **Server-side `GITHUB_TOKEN` env var with classic PAT (public-repo read scope only).** Authenticated rate limit is 5,000/hr vs 60/hr unauthenticated. ISR `revalidate: 600` already collapses traffic to ~6 calls/hr/region globally, so unauthenticated *would* technically suffice — but the token costs nothing and removes the rate-limit failure mode entirely. Wrap the fetch in try/catch + return `{ commits: null, error: 'fetch_failed' }` on non-200; the cached page continues serving via Next 16's stale-while-revalidate even when the background revalidation fails. Use `?per_page=10` + `?since=ISO_DATE` for the "shipped this week" filter (one call, server-side filter, cleaner than two calls).
3. **Reading `.planning/ROADMAP.md` from the deploy bundle (Q3):** **Use `outputFileTracingRoot` + `outputFileTracingIncludes` in `next.config.ts`.** The repo is a pnpm monorepo (`apps/*` + `packages/*`); `outputFileTracingRoot: path.join(__dirname, '../../')` rebases tracing to repo root, then `outputFileTracingIncludes: { '/': ['../../.planning/ROADMAP.md'] }` ships the file into the serverless function bundle. `fs.readFileSync` then resolves at `process.cwd()` + the relative path. This is one config block in `next.config.ts` — the cleanest path. Alternative (pre-compute to JSON at build time) is more moving parts; reject unless tracing config proves brittle.
4. **Anonymous Supabase writes (Q4):** **Use a Server Action with the regular cookie-auth supabase client + a permissive INSERT-only RLS policy `TO anon`.** No service-role key, no bypass. The Server Action validates input (Zod), normalizes the email (lowercase + trim), and does `INSERT ... ON CONFLICT (email) DO NOTHING RETURNING id` via Drizzle. Idempotent by construction. RLS policy: `FOR INSERT TO anon WITH CHECK (true)` paired with `FOR SELECT TO authenticated USING (false)` (no one can read it from the client, including Filippo's logged-in session — admin reads happen in psql/Studio only). Abuse mitigation v1: a hidden honeypot field + a Server-Action-side per-IP rate limit (read `x-forwarded-for` from `next/headers`, bucket in memory or Supabase upsert). Cloudflare Turnstile is the v2 upgrade if abuse appears; do not ship in v1.
5. **Motion 12 typing pattern (Q5):** **Vanilla `useState` + `setTimeout` for character-by-character typing** (UI-SPEC §7b explicitly says "NOT framer-motion-driven — vanilla `useEffect` + `setTimeout`"). **Use `motion/react`'s `<motion.div>` + `AnimatePresence`** for the receipt fade-up animations (opacity + translateY) and the show-another swap. `useReducedMotion()` hook guards both. Motion 12 ships a `<Typewriter>` component as of 2026 — DO NOT use it; the FSM control UI-SPEC §7b describes (typed-input → 600ms pause → submit-flash → blank line → staggered receipts → settle) is more orchestration than `<Typewriter>` exposes.
6. **`FRAMEWORK.md` content shape (Q6):** Follow the **nanoGPT README structure** (compressed). Suggested outline below. Targets ~250-400 lines, mostly prose with one ASCII diagram + 5 primitive sections + a "fork this" runbook.
7. **OG image (Q7):** Place `apps/web/app/opengraph-image.png` (1200×630, static PNG) — Next 16 auto-emits the `<meta property="og:image">` tag. Same file at `apps/web/app/twitter-image.png` for Twitter. Override `metadata.openGraph.title` + `metadata.openGraph.description` on the landing page (NOT root layout, since the app shell shouldn't carry landing meta).
8. **Route group (Q8):** **Keep `apps/web/app/page.tsx` as the conditional render** (logged-in redirect; logged-out renders `<LandingPage />`). Do **not** create a `(public)` route group. The app already has `(app)` for authed routes; introducing `(public)` for one file is over-architecture. `apps/web/app/layout.tsx` is the root layout — it currently wires fonts + `<Providers>` (next-themes only); the landing inherits this cleanly. The landing does **not** need the `(app)/layout.tsx` chrome (sidebar/AppShell), so there is nothing to opt out of.

---

## Standard Stack (verified against `apps/web/package.json`)

Everything the landing needs is **already installed**. Zero new dependencies.

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | `^16.0.0` | App Router, Server Components, ISR, file-based metadata, `<Image>` | Project framework; no alternative |
| React | `^19.2.0` | UI | Required by Next 16 |
| TypeScript | `^5.6.0` (strict) | Types | Project standard |
| Tailwind 4 | `^4.1.0` | Styling | UI-SPEC explicitly consumes existing `@theme` tokens — landing introduces ZERO new tokens |
| `motion` | `12.38.0` | `motion/react` for receipt fade-up + caret + show-another swap | UI-SPEC §6 motion budget; CLAUDE.md mandates `motion/react`, NOT legacy `framer-motion` |
| `next-themes` | `0.4.6` | Light/dark — landing is light-first but respects toggle | Already in `providers.tsx` |
| `@supabase/ssr` | `^0.10.0` | Server-side Supabase client (cookie auth) | Used by `lib/supabase/server.ts`; Server Action for waitlist uses this client unchanged |
| `drizzle-orm` | `^0.36.0` | New `waitlist` table + INSERT | Standard data-layer per CLAUDE.md |
| `postgres` | `^3.4.0` | Drizzle driver | Standard |
| `zod` | `4` | Waitlist input validation | Standard validation lib |
| `react-hook-form` + `@hookform/resolvers` | `7` / `^5.2.2` | Waitlist form binding | UI-SPEC §13 explicitly names |
| `lucide-react` | `^0.460.0` | `ArrowUpRight`, `ArrowRight`, `BookOpen`, `Github`, `ChevronDown` icons | Already in stack |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn primitives | (existing) | `Button`, `Input`, `Label`, `Separator` per UI-SPEC §1 | Use the existing files in `apps/web/components/ui/` |
| `tailwind-merge` + `clsx` | (existing) | `cn()` utility on landing components | Standard pattern |
| `sonner` | `2.0.7` | NOT used on landing — UI-SPEC §5e specifies inline form swap (no toast) | Skip |
| `@tanstack/react-query` | `^5.59.0` | NOT used on landing — no realtime, no client cache | Skip |

### Alternatives Considered (and rejected — kept here so the planner doesn't reopen these)
| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| Vanilla `setTimeout` typing | Motion 12 `<Typewriter>` | UI-SPEC §7b prescribes vanilla `setTimeout` FSM — the choreography (typed → pause → submit-flash → receipts stream) exceeds `<Typewriter>`'s declarative model. Inversion of control. |
| `outputFileTracingIncludes` for ROADMAP.md | Pre-compute roadmap → JSON at prebuild | Pre-compute adds a script + a new artifact + cache-staleness risk. Tracing-includes is one config block. Prefer tracing. |
| Server-side `GITHUB_TOKEN` for build-log | Unauthenticated (60/hr/IP) | Unauthenticated technically suffices given ISR (`revalidate: 600` → ≤6 calls/hr/region), but the token costs nothing and removes a failure mode that only manifests under traffic spike. Use the token. |
| Server Action with service-role client | Service-role bypass of RLS | Service-role anywhere on the public landing is a footgun. The whole point of anon-RLS is to NOT need elevated credentials. Reject. |
| Cloudflare Turnstile in v1 | Honeypot + IP rate limit | Turnstile adds a script tag + a UX seam ("verify you are human"). Honeypot + IP rate limit is invisible and cheaper. Ship Turnstile only if abuse appears. |
| `(public)` route group | Conditional render in `page.tsx` | Over-architecture for one file. Reject. |

**Installation:**
```bash
# Nothing new. Zero install. Verify zero install with:
pnpm install --frozen-lockfile
```

**Version verification:** All versions above pulled from `apps/web/package.json` 2026-05-25. No external version check needed since we're adding zero dependencies.

---

## Architecture Patterns

### Recommended Project Structure (delta only — new files / edits)

```
hyperpolymath-v2/
├── FRAMEWORK.md                                       # NEW (repo root, next to README.md per D-06)
├── next.config.ts                                     # EDIT: add outputFileTracingRoot + outputFileTracingIncludes
├── .env.example                                       # EDIT: add GITHUB_TOKEN
├── apps/web/
│   ├── app/
│   │   ├── page.tsx                                   # EDIT: conditional render (logged-in redirect; logged-out renders LandingPage)
│   │   ├── opengraph-image.png                        # NEW (1200×630 static PNG)
│   │   ├── twitter-image.png                          # NEW (same file, separate name for Next 16 file convention)
│   │   └── actions/
│   │       └── waitlist.ts                            # NEW Server Action
│   ├── components/
│   │   └── landing/
│   │       ├── LandingPage.tsx                        # top-level layout, renders all sections in order
│   │       ├── LandingHeader.tsx                      # 40px sticky header eyebrow
│   │       ├── LandingFooter.tsx                      # 3-col mono footer + ornament + sign-off
│   │       ├── SectionDivider.tsx                     # ⚜ ⚜ ⚜ ornament row
│   │       ├── SectionEyebrow.tsx                     # "§ 02 · DEMO" mono label
│   │       ├── ThesisSection.tsx                      # §01
│   │       ├── JarvisDemo.tsx                         # §02 — CYAN-BEARING per UI-SPEC §4
│   │       ├── PrimitivesTable.tsx                    # §03
│   │       ├── EngineSection.tsx                      # §04 — CYAN-BEARING per UI-SPEC §4
│   │       ├── ChoiceSection.tsx                      # §05 (waitlist door + fork door)
│   │       ├── WaitlistForm.tsx                       # client component, owns submit + success swap
│   │       ├── BuildLog.tsx                           # §06 — Server Component, ISR
│   │       └── lib/
│   │           ├── readRoadmap.ts                     # fs.readFileSync + parse "## Progress" table
│   │           └── fetchCommits.ts                    # GitHub API fetch with revalidate + filter
│   └── lib/db/schema.ts                               # EDIT: add waitlist table
├── apps/web/drizzle/
│   └── 0008_waitlist.sql                              # NEW Drizzle migration
├── apps/web/supabase/migrations/
│   └── 0012_waitlist.sql                              # NEW raw migration (table + RLS policies)
└── packages/jarvis-core/tests/
    └── strict-tool-use.fixture.ts                     # NEW — referenced by UI-SPEC §11e but does not yet exist
```

> **Important load-bearing finding:** UI-SPEC §11e gate `"Engine §04 JSON is plucked from a REAL `jarvis-core/tests/` fixture"` and source note `"Plucked verbatim from packages/jarvis-core/tests/strict-tool-use.fixture.ts — no edits"` reference a file that **does not currently exist**. Verified by `find /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/packages/jarvis-core/tests -type f`. The planner MUST include a task to create `strict-tool-use.fixture.ts` exporting a real input → strict-tool-use JSON example (likely lifted from an existing live JARVIS turn in `jarvis_events` or hand-canonicalized from `slash-command.test.ts` / `tools.test.ts`). Without this file, UI-SPEC §11e fails by construction.

### Pattern 1: Root-route conditional render (preserves logged-in behavior — SC-1)

```tsx
// apps/web/app/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/LandingPage";

export default async function Root() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/today");
  return <LandingPage />;
}
```

**Why:** Single file owns both branches. `redirect()` halts execution before `<LandingPage />` renders, so logged-in users never pay the landing's RSC cost. No `(public)` route group needed. UI-SPEC §13 already locks this contract.

**Caveat:** `page.tsx` itself does NOT export `revalidate = 600`. The page stays **dynamic** (auth check). ISR moves to the `BuildLog` Server Component which is rendered as a child — see Pattern 2.

### Pattern 2: ISR scoped to a Server Component child (Q1 resolution)

The Next 16 idiomatic approach for "this page is dynamic at the root but one child fetches and caches external data":

```tsx
// apps/web/components/landing/BuildLog.tsx
import fs from "node:fs/promises";
import path from "node:path";
import { fetchRecentCommits } from "./lib/fetchCommits";
import { parseCurrentPhase } from "./lib/readRoadmap";

// NOT exported as route-segment config — this is a child component.
// ISR is achieved via fetch's per-call cache hint instead.

export async function BuildLog() {
  // Build-time read of ROADMAP.md (Server Component executes at build for static routes,
  // at request time for dynamic routes; either way fs read resolves via outputFileTracingIncludes)
  const roadmapPath = path.join(process.cwd(), "../../.planning/ROADMAP.md");
  const roadmap = await fs.readFile(roadmapPath, "utf-8");
  const currentPhase = parseCurrentPhase(roadmap);

  // ISR via fetch options — Next 16 caches this response for 600s, stale-while-revalidate beyond
  const commits = await fetchRecentCommits();
  // fetchRecentCommits internally calls:
  //   fetch(url, { next: { revalidate: 600 }, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } })

  // D-10 graceful degradation
  if (!commits) {
    return <BuildLogDegraded currentPhase={currentPhase} />;
  }

  return <BuildLogFull currentPhase={currentPhase} commits={commits} />;
}
```

**Why this works in Next 16:**
- The `fetch()` extension `{ next: { revalidate: 600 } }` is the canonical per-request ISR hint and works inside any Server Component, regardless of the route's own dynamic-ness.
- The page itself stays dynamic (because `page.tsx` reads cookies via `getClaims()`), so the entire page re-renders per request — but the GitHub `fetch` deduplicates via the Data Cache and serves the cached body for 600s, refreshing in the background.
- **Stale-while-revalidate is the cache failure mode:** if a background revalidation fetch returns 5xx or 403, Next 16 continues serving the last good cached response and retries on the next revalidation window. Cache failures degrade gracefully ("stale content, extra renders"), not break.

**Source:** Next.js docs — Guides: How Revalidation Works + Functions: fetch.

### Pattern 3: GitHub API call with auth + filter + graceful failure (Q2 resolution)

```ts
// apps/web/components/landing/lib/fetchCommits.ts
const REPO = "filippo-fonseca/hyperpolymath-v2";

type Commit = {
  sha: string;
  shortSha: string;       // sha.slice(0, 7)
  date: string;           // ISO from author.date
  subject: string;        // first line of commit.message
};

export async function fetchRecentCommits(): Promise<Commit[] | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Soft-fail in dev/preview if token absent — return null so UI degrades per D-10
    console.warn("[BuildLog] GITHUB_TOKEN missing; commits feed disabled");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=10`,
      {
        next: { revalidate: 600 },                  // ISR — 10 min cache
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) {
      // 403 (rate limit) or 5xx — cached response continues serving via SWR
      console.warn(`[BuildLog] GitHub API ${res.status}; degrading`);
      return null;
    }
    const raw = (await res.json()) as Array<{
      sha: string;
      commit: { message: string; author: { date: string } };
    }>;
    return raw.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      date: c.commit.author.date,
      subject: c.commit.message.split("\n")[0],
    }));
  } catch (e) {
    console.error("[BuildLog] commit fetch threw:", e);
    return null;
  }
}

export function shippedThisWeek(commits: Commit[]) {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = commits.filter((c) => +new Date(c.date) >= oneWeekAgo);
  const counts = { feat: 0, fix: 0, refactor: 0, other: 0 };
  for (const c of recent) {
    if (c.subject.startsWith("feat(") || c.subject.startsWith("feat:")) counts.feat++;
    else if (c.subject.startsWith("fix(") || c.subject.startsWith("fix:")) counts.fix++;
    else if (c.subject.startsWith("refactor(") || c.subject.startsWith("refactor:")) counts.refactor++;
    else counts.other++;
  }
  return { recent, counts, latest: recent[0] };
}
```

**Why server-side `GITHUB_TOKEN` over unauthenticated:**
- Unauthenticated: 60 req/hr/IP. With `revalidate: 600`, theoretical ceiling is ~6 calls/hr per Vercel function region. Could survive — but a preview deploy + production + a regional rebuild can stack.
- Authenticated: 5,000 req/hr per token. Zero risk under any imaginable hyperpolymath traffic.
- Cost: `GITHUB_TOKEN` is a free classic PAT with **public-repo read scope only** (no write, no private). Or fine-grained PAT scoped to the one repo. Zero security exposure.
- Source: GitHub Docs — "Rate limits for the REST API" (2026): primary rate limit is 60/hr unauthenticated, 5,000/hr authenticated.

**Why `per_page=10` + server-side filter (vs `?since=<date>`):**
- `?since` only filters commits the API returns, but it does the date-math on the *server* by author-date — sometimes excludes commits with intentionally older committer dates. Fetching 10 + filtering in Node is simpler, deterministic, and one round-trip.
- 10 is enough for both displays: UI-SPEC §5f Block 2 shows "LAST 7 COMMITS" + Block 3 computes "shipped this week" — both fit in 10.

**Failure modes:**
- 403 (rate limit) → return `null` → BuildLog component renders the degraded variant (D-10 satisfied)
- Network timeout → caught in `try/catch` → same degraded variant
- Token missing in env → soft warn + null
- Stale cache during revalidation failure → Next 16 continues serving prior cached value (per docs); user sees marginally stale data, not a broken page

### Pattern 4: Reading ROADMAP.md from a serverless function (Q3 resolution)

The repo is a pnpm monorepo: root `package.json` declares `packages: ["apps/*", "packages/*"]` (verified). Vercel deploys typically only trace files reachable from `apps/web/`. `.planning/ROADMAP.md` lives at repo root and is otherwise invisible to `@vercel/nft`.

**Solution: `outputFileTracingRoot` + `outputFileTracingIncludes` in `apps/web/next.config.ts`:**

```ts
// apps/web/next.config.ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hyperpolymath/jarvis-core"],

  // Rebase tracing to the monorepo root so we can reference files outside apps/web
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Include the roadmap in the deploy bundle
  outputFileTracingIncludes: {
    // The '/' key targets the root route — narrowest scope possible
    "/": ["../../.planning/ROADMAP.md"],
  },
};

export default nextConfig;
```

**Then in the Server Component:**
```ts
import path from "node:path";
import fs from "node:fs/promises";

const roadmapPath = path.join(process.cwd(), "../../.planning/ROADMAP.md");
const roadmap = await fs.readFile(roadmapPath, "utf-8");
```

**Why `process.cwd()` and `../../`:** On Vercel the function's CWD is the project root (where `next.config.ts` sits — `apps/web/`). Walking `../../` from there lands at repo root, where `.planning/` is included by the tracing config.

**Source:** Next.js docs — `next.config.js: output` / Output File Tracing. Confirmed pattern for monorepo file access. Note: GitHub Issue #46697 documents historical path-resolution bugs in tracing — verify the file is in the deploy bundle by running `pnpm build` locally and checking `apps/web/.next/standalone/` (if standalone output) or by deploying to a preview branch and hitting the endpoint.

**Alternative rejected:** Pre-compute roadmap → JSON at prebuild step. Adds a script + a new artifact + cache-staleness risk + breaks editor-mode-reload during development. Tracing-includes is one config block, zero artifacts. Prefer tracing.

**Parser shape (`readRoadmap.ts`):**

```ts
// Find rows in the "## Progress" table where Status contains "In Progress"
// Format: | 7. JARVIS Voice + Ambient | 3/4 | In Progress|  |
const ROW_RE = /^\| ([\d.]+\.\s.+?) \| (\d+\/\d+) \| In Progress\|/gm;

export function parseCurrentPhase(roadmap: string): {
  number: string;
  name: string;
  plansComplete: string;
} | null {
  const match = ROW_RE.exec(roadmap);
  if (!match) return null;
  const [, label, plansComplete] = match;
  const [number, ...nameparts] = label.split(". ");
  return { number, name: nameparts.join(". ").trim(), plansComplete };
}
```

### Pattern 5: Anonymous-write Supabase table with RLS (Q4 resolution)

The codebase pattern (verified via `0001_rls_policies.sql` + `0011_jarvis_facts.sql`) is:
1. Drizzle schema declares the table
2. Drizzle migration (`drizzle/000N_*.sql`) creates the table
3. Raw Supabase migration (`apps/web/supabase/migrations/00MM_*.sql`) enables RLS + creates policies

The waitlist is the **first table to break the `userId`-scoped pattern**. Both INSERT and SELECT access patterns differ:

**Schema (`lib/db/schema.ts` append):**
```ts
// waitlist — Phase 8 (D-12). Anonymous email capture from the public landing.
// No userId column (signups are unauthenticated). UNIQUE on email enforces
// idempotent re-submits. RLS: INSERT open to anon, SELECT closed to everyone
// (admin reads happen in psql / Supabase Studio with service role).
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),  // lowercase + trim normalized at insert time
    note: text("note"),                       // D-12 "what do you do? (optional)"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Optional: track origin for analytics later (no PII)
    submittedIp: text("submitted_ip"),        // hashed in Server Action, NOT raw IP
  },
  (t) => [uniqueIndex("waitlist_email_uniq").on(t.email)],
);
```

**Raw migration (`apps/web/supabase/migrations/0012_waitlist.sql`):**
```sql
-- Phase 8 (D-12). Anonymous email capture; first table breaking the user_id RLS pattern.
CREATE TABLE IF NOT EXISTS public.waitlist (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  submitted_ip  text
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_uniq ON public.waitlist (email);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- INSERT: open to anon (the supabase-js client uses the anon role on
-- unauthenticated requests). WITH CHECK (true) — input validation lives in
-- the Server Action via Zod, not in SQL.
CREATE POLICY "waitlist_anon_insert" ON public.waitlist
  FOR INSERT TO anon
  WITH CHECK (true);

-- Also allow authenticated users to insert (Filippo could submit while
-- logged in; harmless). Same WITH CHECK (true).
CREATE POLICY "waitlist_authenticated_insert" ON public.waitlist
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- SELECT: closed to both anon and authenticated. No browser-side reads.
-- Filippo reads waitlist via supabase studio / psql with service role.
-- No SELECT policy = no rows visible. This is intentional.

-- UPDATE/DELETE: no policies = no operations. Admin only via service role.
```

**Server Action (`apps/web/app/actions/waitlist.ts`):**
```ts
"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

const WaitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  note: z.string().trim().max(280).optional(),
  // Honeypot — bots fill all fields; real humans don't see this one (display:none)
  website: z.string().max(0).optional(),  // must be empty
});

type ActionResult = { success: true } | { success: false; error: string };

// In-memory IP bucket — survives within a single serverless function instance.
// For a stronger v2 throttle, upsert into a supabase table and check count.
const ipBucket = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
const RATE_LIMIT = 5;                    // max 5 submits per IP per hour

function getHashedIp(): string {
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function checkRateLimit(hashedIp: string): boolean {
  const now = Date.now();
  const history = (ipBucket.get(hashedIp) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (history.length >= RATE_LIMIT) return false;
  history.push(now);
  ipBucket.set(hashedIp, history);
  return true;
}

export async function joinWaitlist(input: unknown): Promise<ActionResult> {
  const parsed = WaitlistSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid email." };
  }
  // Honeypot tripped → silently succeed (don't tell the bot it was caught)
  if (parsed.data.website && parsed.data.website.length > 0) {
    return { success: true };
  }

  const hashedIp = getHashedIp();
  if (!checkRateLimit(hashedIp)) {
    return { success: false, error: "Too many submissions. Try again in an hour." };
  }

  try {
    // Idempotent — ON CONFLICT DO NOTHING. Returns no rows if email already exists,
    // but we report success either way (don't leak which emails are on the list).
    await db
      .insert(waitlist)
      .values({
        email: parsed.data.email,
        note: parsed.data.note,
        submittedIp: hashedIp,
      })
      .onConflictDoNothing({ target: waitlist.email });
    return { success: true };
  } catch (e) {
    console.error("[waitlist] insert failed:", e);
    return { success: false, error: "Couldn't reach the list. Try again, or email filippo directly." };
  }
}
```

**Important nuance on the Drizzle client + RLS:** `lib/db/client.ts` uses the `postgres` driver with whatever connection string is in `DATABASE_URL`. Supabase's pooler URL (`...pooler.supabase.com:6543`) authenticates as the database owner role — **which bypasses RLS entirely** for Server Action / API route inserts. This is the existing project pattern for all Server Actions (verified in `captures.ts` et al.). For the waitlist, this means:
- The Server Action's Drizzle INSERT succeeds regardless of RLS policy (DB owner bypasses RLS)
- The RLS policies above are defense-in-depth — they only matter if a future contributor accidentally uses the `supabase-js` browser client to INSERT directly
- The `anon` INSERT policy IS still load-bearing if any future code path goes through `supabase-js` from the browser

**Verify:** Run `psql $DATABASE_URL -c "SHOW SESSION AUTHORIZATION"` against the pooler to confirm the role (should be `postgres` or the project's db owner). If a future migration adds RLS-respecting Drizzle (via `setSessionConfig({ role: 'authenticated', userId })`), this policy actually fires.

**Abuse mitigation defense layers:**
1. **Honeypot** — invisible `<input name="website">` rejected if filled (catches dumb bots)
2. **IP rate limit** — 5 submits/hr/IP in-memory bucket (catches less-dumb bots)
3. **Zod validation** — bounded `max(320)` email, `max(280)` note (catches payload spray)
4. **UNIQUE constraint + ON CONFLICT DO NOTHING** — duplicate emails are silent no-ops (catches double-submits + targeted enumeration)
5. **No SELECT policy** — even with the row inserted, no client-side path reads the list (no leakage)

**Cloudflare Turnstile is the v2 upgrade** if real abuse appears. Don't ship in v1 — adds a script tag + a UX seam ("verify you are human") that fights the manifesto's quietness.

### Pattern 6: Motion 12 typing + receipts pattern (Q5 resolution)

UI-SPEC §7b explicitly mandates `useEffect + setTimeout` for typing (NOT `motion`-driven). Motion 12 ships a `<Typewriter>` component in 2026, but the choreography UI-SPEC describes (typed → 600ms pause → submit-flash → blank line → staggered receipts → settle) exceeds what `<Typewriter>` exposes.

**Recommended pattern: hybrid — vanilla state machine for typing, `motion/react` for receipt entrances.**

```tsx
// apps/web/components/landing/JarvisDemo.tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

type DemoState =
  | { phase: "typing"; typedChars: number }
  | { phase: "pause" }
  | { phase: "submitted" }
  | { phase: "settled" };

type Example = {
  input: string;
  receipts: Array<{ verb: string; body: string }>;
};

const EXAMPLES: Example[] = [
  {
    input: "dinner with anna 8pm saturday. buy her flowers friday afternoon",
    receipts: [
      { verb: "scheduled", body: 'gcal · sat 8:00pm · "Dinner with Anna"' },
      { verb: "created",   body: 'task · fri afternoon · P2 · "Buy flowers"' },
    ],
  },
  // ...B, C per UI-SPEC §7c
];

const CHAR_INTERVAL_MS = 35;       // 28 cps per UI-SPEC §6
const PUNCT_PAUSE_MS = 140;        // additional pause on '.' and ','
const POST_TYPE_PAUSE_MS = 600;    // UI-SPEC §7b step 3
const RECEIPT_STAGGER_MS = 220;    // UI-SPEC §6
const SETTLE_MS = 2000;

export function JarvisDemo() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const [state, setState] = useState<DemoState>({ phase: "typing", typedChars: 0 });
  const reducedMotion = useReducedMotion();
  const example = EXAMPLES[exampleIdx];

  // Reduced-motion bypass: jump straight to settled (D-02)
  useEffect(() => {
    if (reducedMotion) {
      setState({ phase: "settled" });
      return;
    }
    setState({ phase: "typing", typedChars: 0 });
  }, [exampleIdx, reducedMotion]);

  // Typing loop — chars at a time via setTimeout (vanilla FSM)
  useEffect(() => {
    if (reducedMotion || state.phase !== "typing") return;
    if (state.typedChars >= example.input.length) {
      const t = setTimeout(() => setState({ phase: "pause" }), 0);
      return () => clearTimeout(t);
    }
    const nextChar = example.input[state.typedChars];
    const delay =
      nextChar === "." || nextChar === "," ? CHAR_INTERVAL_MS + PUNCT_PAUSE_MS : CHAR_INTERVAL_MS;
    const t = setTimeout(() => {
      setState({ phase: "typing", typedChars: state.typedChars + 1 });
    }, delay);
    return () => clearTimeout(t);
  }, [state, example.input, reducedMotion]);

  // Pause → submitted → settled
  useEffect(() => {
    if (reducedMotion) return;
    if (state.phase === "pause") {
      const t = setTimeout(() => setState({ phase: "submitted" }), POST_TYPE_PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (state.phase === "submitted") {
      const totalReceiptTime = example.receipts.length * RECEIPT_STAGGER_MS + SETTLE_MS;
      const t = setTimeout(() => setState({ phase: "settled" }), totalReceiptTime);
      return () => clearTimeout(t);
    }
  }, [state.phase, example.receipts.length, reducedMotion]);

  const showCaret = state.phase === "typing";
  const showReceipts = state.phase === "submitted" || state.phase === "settled";
  const typedText =
    state.phase === "typing"
      ? example.input.slice(0, state.typedChars)
      : example.input;

  function showAnother() {
    // Per UI-SPEC §7d: 200ms fade-out → next example begins typing
    setExampleIdx((i) => (i + 1) % EXAMPLES.length);
  }

  return (
    <div className="space-y-4">
      <div className="font-mono text-[14px] leading-[1.55] border border-[var(--edge)] rounded p-6 bg-[var(--surface-raised)] max-w-[760px] mx-auto overflow-x-auto custom-scrollbar">
        <div className="text-[var(--ink)]">
          <span className="text-[var(--ink-muted)]">$ </span>
          {typedText}
          {showCaret && (
            <span className="text-[var(--hud-cyan)] animate-pulse">▮</span>
            // .hud-streaming-caret is the canonical class in globals.css if it exists; otherwise animate-pulse
          )}
        </div>
        {showReceipts && (
          <AnimatePresence>
            <div className="mt-4 space-y-2">
              {example.receipts.map((r, i) => (
                <motion.div
                  key={`${exampleIdx}-${i}`}
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.28,
                    delay: reducedMotion ? 0 : i * 0.22,
                    ease: [0.25, 1, 0.5, 1],  // --ease-out-quart
                  }}
                >
                  <span className="text-[var(--hud-cyan)]">⚜  </span>
                  <span className="text-[var(--hud-cyan)] font-medium">{r.verb}</span>
                  <span className="text-[var(--ink)]">  →  {r.body}</span>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
      <div className="flex justify-end max-w-[760px] mx-auto">
        <button
          onClick={showAnother}
          className="font-mono text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] opacity-70 hover:opacity-100 transition-opacity"
        >
          ▶ show another
        </button>
      </div>
    </div>
  );
}
```

**Reduced-motion handling (D-02):**
- `useReducedMotion()` from `motion/react` returns `true` if `(prefers-reduced-motion: reduce)` matches
- When true: state jumps directly to `"settled"`, typing loop short-circuits, motion `initial` becomes `false` (so no animation), stagger delay zeroed
- Caret simply does not render (no animation, no flicker)

**Why this pattern over Motion 12's `<Typewriter>`:**
- `<Typewriter>` is declarative ("here's the string, animate it"); we need orchestration (caret pulse during typing only, punctuation pause, post-type pause, submit-flash, blank line, receipt stagger, settle)
- FSM gives explicit control over each beat — easy to tune timings, easy to debug
- Motion handles only what it's good at: the fade-up entrance on receipts + the show-another swap

**Sources:**
- Motion docs — Typewriter, Stagger, `useReducedMotion` hook
- Verified `.font-mono-stats` and `.custom-scrollbar` exist in globals.css (lines 327, 333)

### Pattern 7: OG image and metadata (Q7 resolution)

**File convention (Next 16 App Router):**
- `apps/web/app/opengraph-image.png` (1200×630 static PNG) → Next 16 auto-emits `<meta property="og:image">`
- `apps/web/app/twitter-image.png` (same file, separate convention) → `<meta name="twitter:image">`
- Alt text via sibling `opengraph-image.alt.txt` (one line of UTF-8)

**Page-level metadata override:**
```tsx
// apps/web/app/page.tsx — add metadata export
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hyperpolymath — Type one sentence.",
  description: "A personal life-OS for people who refuse to specialize. One inbox. One agent. One sentence.",
  openGraph: {
    title: "Hyperpolymath — Type one sentence.",
    description: "A personal life-OS for people who refuse to specialize.",
    type: "website",
    url: "https://hyperpolymath.com",  // or wherever it deploys
    siteName: "Hyperpolymath",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hyperpolymath — Type one sentence.",
    description: "A personal life-OS for people who refuse to specialize.",
  },
};
```

**Important:** `openGraph` and `twitter` objects do NOT auto-inherit from top-level `title`/`description` — must be set explicitly. Per Next docs.

**Static image recommendation:** parchment background (the `--canvas` color: `oklch(97% 0.005 75)`), Display 1-sized "Type one sentence." in EB Garamond 600 centered, single `⚜` ornament below, "HYPERPOLYMATH · MANIFESTO" in mono at top, "EST. 2026 / MIT" in mono at bottom right. Consistent with the landing's discipline. Generate manually (Figma / Sketch) — out of scope per CONTEXT.md "Deferred" for dynamic gen, but the static file must be created.

**Root-layout metadata stays unchanged:**
```tsx
// apps/web/app/layout.tsx — current state, do NOT change
export const metadata: Metadata = {
  title: "Hyperpolymath",
  description: "I brought back the Renaissance.",
};
```

The page-level metadata override above wins for `/`. Authed routes inherit the root-layout default. (Authed surfaces shouldn't carry the landing's OG image anyway.)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API client | Custom fetch wrapper with retry, ETag, etc. | Plain `fetch` with `next: { revalidate: 600 }` + Bearer token | One-call surface; Next 16's Data Cache already does dedup + SWR + retry on next revalidation window |
| ISR cache layer | Custom in-memory cache with TTL | Next 16's `fetch` cache (`{ next: { revalidate } }`) | The whole point of Next 16's Data Cache is exactly this |
| ROADMAP.md parser | Markdown parser (`remark`, `unified`, `marked`) | One regex against the `## Progress` table | The roadmap has a known stable format; regex is 4 lines, parser is a dependency tree |
| Email validation | Custom regex / `validator.js` | Zod `.email()` | Already in stack, battle-tested |
| Form state | Plain `useState` per field | `react-hook-form` + `zodResolver` | Already in stack (UI-SPEC §13), gives field-level errors + dirty/valid tracking for free |
| Rate limiter | Redis / Upstash / DB-backed counter | In-memory `Map` in Server Action module scope | Single-region MVP, low traffic, acceptable failure mode (fresh function instance starts a new bucket). Upgrade to DB-backed only if abuse appears. |
| Honeypot bot detection | Image CAPTCHA, reCAPTCHA | Empty hidden text field + Zod `.max(0)` | Invisible to users, catches dumb bots, costs zero UX |
| Typing animation library | `typed.js`, `react-typed`, `react-typewriter` | Vanilla `useState` + `setTimeout` FSM | UI-SPEC §7b explicitly mandates vanilla FSM; libraries add dependency bloat for a 50-line FSM |
| Markdown rendering on landing | `react-markdown`, MDX | Static JSX (UI-SPEC copy is finite & frozen in §9) | Copy is fixed; rendering it as markdown adds runtime cost for no benefit |
| OG image generation | `@vercel/og`, Satori | One static PNG file at `app/opengraph-image.png` | CONTEXT.md explicitly defers dynamic OG gen; static is one file |
| Syntax highlighter for Engine JSON | Shiki, Prism, highlight.js | Plain `<code>` with inline `<span>` color classes | UI-SPEC §5d specifies manual span coloring; ~12 lines of JSON; highlighter is 50KB+ for that |
| Service-role Supabase client for waitlist insert | `createClient` with service-role key in Server Action | Regular cookie-auth `createClient` + open INSERT RLS policy `TO anon` | Service-role anywhere on a public surface is a footgun. The whole point of RLS is to not need it. |

**Key insight:** This phase has near-zero invention surface. Everything is either (a) already in the codebase, (b) a one-line Next 16 built-in, or (c) a 30-line component. The discipline is in NOT building things, not in building things.

---

## Runtime State Inventory

Not a rename / refactor / migration phase. Greenfield landing surface + one new table. SKIPPED.

---

## Common Pitfalls

### Pitfall 1: `revalidate` on `page.tsx` breaks the auth check
**What goes wrong:** Naively adding `export const revalidate = 600` to `apps/web/app/page.tsx` so the build-log is cached caches the **entire page**, including the `getClaims()` redirect logic. Logged-in users would render the landing for up to 10 minutes after authing.
**Why it happens:** Route segment config applies to the whole page, not to children.
**How to avoid:** Keep `page.tsx` dynamic (no `revalidate` export). Scope ISR to the `BuildLog` Server Component via per-`fetch` `next: { revalidate: 600 }` option. The page re-renders per request (cheap), the fetch result is cached and re-used.
**Warning signs:** Logged-in user sees landing page; logged-out user sees `/today` redirect.

### Pitfall 2: `outputFileTracingRoot` breaks all path resolution in CI
**What goes wrong:** Adding `outputFileTracingRoot` rebases tracing globally; some other file (`postgres` driver native binaries, `@hyperpolymath/jarvis-core` ESM source) silently stops getting included in the bundle. Build passes; production crashes with `MODULE_NOT_FOUND`.
**Why it happens:** Tracing is per-route-glob; misconfiguration is hard to detect statically.
**How to avoid:** After adding the config, run `pnpm build` locally and **manually verify** by deploying to a Vercel preview branch first. Hit the landing route. If `.planning/ROADMAP.md` is missing, the BuildLog falls back gracefully — but check the function logs for `ENOENT`. GitHub Issue #46697 documents historical pain points; treat with caution.
**Warning signs:** `pnpm build` succeeds locally; preview deploy logs show `Error: ENOENT: no such file or directory, open '../.planning/ROADMAP.md'`.

### Pitfall 3: `process.cwd()` differs between dev and production
**What goes wrong:** `process.cwd()` in `next dev` is `apps/web/`; on Vercel after `outputFileTracingRoot`, it can be the rebased root or `apps/web/` depending on how the function bundle is constructed. Path math breaks.
**Why it happens:** Inconsistent CWD across runtimes.
**How to avoid:** Test BOTH paths. The robust approach: try the relative path, fall back to an absolute repo-root-anchored path:
```ts
const candidates = [
  path.join(process.cwd(), "../../.planning/ROADMAP.md"),
  path.join(process.cwd(), ".planning/ROADMAP.md"),
];
for (const p of candidates) {
  try { return await fs.readFile(p, "utf-8"); }
  catch { continue; }
}
return null;  // degrade
```
**Warning signs:** Dev works; prod returns degraded build-log.

### Pitfall 4: GitHub API returns 403 with a "secondary rate limit" body before hitting 5,000/hr
**What goes wrong:** GitHub enforces secondary (anti-abuse) rate limits that trip at much lower volumes than the primary 5,000/hr — typically when many requests come from one IP in a short window. ISR can briefly fire many parallel revalidations on a Vercel deploy that updates multiple regions simultaneously.
**Why it happens:** Vercel's edge cache invalidates per-region; each region's first request triggers its own revalidation; if a deploy causes 5+ regions to fetch within seconds, secondary rate limit applies.
**How to avoid:** Already handled by graceful degradation (D-10) — 403 returns null, page renders the degraded variant. Status code distinguishes: 403 with `X-RateLimit-Remaining: 0` is rate limit; 403 with `message: "API rate limit exceeded"` body is secondary. Either way: degrade.
**Warning signs:** Build-log section shows the degraded message intermittently right after a deploy.

### Pitfall 5: Drizzle ORM with the postgres pooler bypasses RLS
**What goes wrong:** The waitlist's RLS policy `FOR INSERT TO anon WITH CHECK (true)` looks like a security boundary but doesn't fire because the Drizzle client connects via the Supabase pooler with the database-owner role, which BYPASSES RLS.
**Why it happens:** The pooler uses `postgres` (or project-owner) Postgres role, not `anon` or `authenticated`. RLS only applies to the `anon` and `authenticated` roles.
**How to avoid:** Accept this as the existing project pattern (verified in all `actions/*.ts` files). The RLS policy is defense-in-depth for the unlikely case someone calls the table from a browser `supabase-js` client. Security in the Server Action layer is: Zod validation + honeypot + rate limit + idempotent ON CONFLICT.
**Warning signs:** None — this is by design. Documenting so the planner doesn't assume RLS is the security boundary.

### Pitfall 6: Animations fire before fonts load → layout shift (Lighthouse killer)
**What goes wrong:** `next/font` loads EB Garamond async; if the JARVIS demo animation starts before the font is ready, the first few typed characters render in fallback (default browser serif), then jump to EB Garamond — CLS spike.
**Why it happens:** `display: swap` (the current config) shows fallback immediately. Fine for body copy, bad for animated mono text.
**How to avoid:** Two options:
1. Pin the demo terminal's font to a system mono fallback that's metrically close to JetBrains Mono (`font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', ui-monospace, monospace`) — `display: swap` already does this for non-animated text; the demo just inherits.
2. Delay animation start by 100ms via `requestIdleCallback` or a `useEffect` with `document.fonts.ready` await.
**Recommended:** Option 1 (CSS fallback stack). Option 2 only if Lighthouse CLS still flags.
**Warning signs:** Lighthouse CLS > 0.1 on the landing route.

### Pitfall 7: JS-disabled visitors see a broken demo (SC-9 violation)
**What goes wrong:** The JarvisDemo component is `"use client"` — with JS disabled, it renders the initial empty state (just `$ ` prompt), looking broken.
**Why it happens:** Client components don't gracefully degrade by default.
**How to avoid:** Server-render the **settled** state of Example A inside JarvisDemo (return the final input + 2 receipts statically as the initial JSX), then the client useEffect re-initializes to `typing` and replays. Visitors with JS disabled see Example A as a static "terminal already finished" snapshot. Visitors with JS see the typing animation replace it.
**Pattern:** Either (a) seed the initial `state` to `"settled"` and let the effect transition back to `typing` post-mount, or (b) gate the animation behind a `mounted` boolean that's `false` on first SSR render.
**Warning signs:** Disable JS in DevTools, load `/`, see empty `$` prompt with no receipts.

### Pitfall 8: Landing inherits `(app)/layout.tsx` chrome
**What goes wrong:** Confusing routing — if the planner moves the landing under `apps/web/app/(public)/page.tsx`, the existing `apps/web/app/layout.tsx` still wraps it (which is fine — fonts + providers only), but a contributor might assume `(app)/layout.tsx` (Sidebar, AppShell) somehow leaks in.
**Why it happens:** Route group syntax confusion.
**How to avoid:** Keep `apps/web/app/page.tsx` as the file (no route group). The root `layout.tsx` wraps it (no chrome to opt out of, just fonts + `<Providers>`). The `(app)` group is sibling and isolated; nothing carries across.
**Warning signs:** None if Q8 recommendation is followed.

### Pitfall 9: Footer link to `filippofonseca.com` 404s or 301s
**What goes wrong:** UI-SPEC §9 hardcodes `filippofonseca.com →` as a footer link. If the URL is stale or redirects through HTTPS, Lighthouse flags it as a best-practice violation.
**Why it happens:** Hardcoded external URLs decay.
**How to avoid:** Verify the URL resolves to a working HTTPS 200 page during plan-phase. If Filippo wants a different URL (e.g., `filippofonseca.dev` or a Twitter handle), the planner asks before locking copy.
**Warning signs:** Lighthouse best-practices score < 95.

### Pitfall 10: `strict-tool-use.fixture.ts` is referenced but doesn't exist
**What goes wrong:** UI-SPEC §11e gate requires "Engine §04 JSON is plucked from a REAL `jarvis-core/tests/` fixture" with the source note "Plucked verbatim from packages/jarvis-core/tests/strict-tool-use.fixture.ts — no edits." That file does NOT currently exist in the repo (verified by `find packages/jarvis-core/tests -type f`).
**Why it happens:** UI-SPEC was authored on the assumption a canonical fixture file existed.
**How to avoid:** Planner adds a task in Wave 1 (or earlier) to create `packages/jarvis-core/tests/strict-tool-use.fixture.ts` that exports a real input → strict-tool-use JSON object — likely lifted from a live `jarvis_events` row or hand-canonicalized from `tools.test.ts`. Then `EngineSection.tsx` imports the fixture so the JSON is provably "verbatim from the source of truth."
**Warning signs:** UI-SPEC §11e check fails at acceptance — there's no fixture to cite.

---

## Code Examples

### Example 1: Page-level metadata + conditional render
```tsx
// apps/web/app/page.tsx
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Hyperpolymath — Type one sentence.",
  description: "A personal life-OS for people who refuse to specialize. One inbox. One agent. One sentence.",
  openGraph: {
    title: "Hyperpolymath — Type one sentence.",
    description: "A personal life-OS for people who refuse to specialize.",
    type: "website",
    siteName: "Hyperpolymath",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hyperpolymath — Type one sentence.",
    description: "A personal life-OS for people who refuse to specialize.",
  },
};

export default async function Root() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/today");
  return <LandingPage />;
}
```

### Example 2: BuildLog Server Component with graceful degradation
```tsx
// apps/web/components/landing/BuildLog.tsx
import { fetchRecentCommits, shippedThisWeek } from "./lib/fetchCommits";
import { parseCurrentPhase } from "./lib/readRoadmap";

export async function BuildLog() {
  const [roadmapText, commits] = await Promise.all([
    readRoadmapSafely(),
    fetchRecentCommits(),
  ]);
  const currentPhase = roadmapText ? parseCurrentPhase(roadmapText) : null;

  return (
    <section className="max-w-[640px] mx-auto px-6 md:px-10 py-16">
      <p className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">§ 06 · BUILD LOG</p>
      <h2 className="font-serif text-[32px] font-semibold mt-2">Live from main.</h2>
      <p className="font-serif text-[18px] mt-4">This page is a build log. Here's where we are.</p>

      {/* Block 1: always renders — local file read */}
      <CurrentlyShipping phase={currentPhase} />

      {/* Block 2 + 3: degrade together if commits unavailable */}
      {commits ? (
        <>
          <LastCommits commits={commits.slice(0, 7)} />
          <ShippedThisWeek summary={shippedThisWeek(commits)} />
        </>
      ) : (
        <DegradedFeed />
      )}
    </section>
  );
}

async function readRoadmapSafely(): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const candidates = [
    path.join(process.cwd(), "../../.planning/ROADMAP.md"),
    path.join(process.cwd(), ".planning/ROADMAP.md"),
  ];
  for (const p of candidates) {
    try { return await fs.readFile(p, "utf-8"); }
    catch { continue; }
  }
  return null;
}
```

### Example 3: Waitlist Drizzle migration + RLS migration pairing
```sql
-- apps/web/drizzle/0008_waitlist.sql (generated by drizzle-kit generate)
CREATE TABLE IF NOT EXISTS "waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_ip" text,
  CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_email_uniq" ON "waitlist" ("email");
```

```sql
-- apps/web/supabase/migrations/0012_waitlist.sql (hand-written, follows 0011 pattern)
-- Phase 8 (D-12). First table breaking the user_id-scoped RLS pattern.
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_anon_insert" ON public.waitlist
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "waitlist_authenticated_insert" ON public.waitlist
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policies — admin reads via service role only.
```

---

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `middleware.ts` for route guards | `proxy.ts` (Next 16) | Next 16 (Oct 2025) | Project already uses correct file; landing inherits |
| `@vercel/og` for all OG images | File convention `opengraph-image.{png,tsx}` | Next 13.3+ | Static landing uses `.png` (deferred dynamic gen) |
| `framer-motion` package | `motion` (rebranded), import from `motion/react` | Late 2024 | Project already on `motion/react`; do not regress |
| `getSession()` in server code | `getClaims()` (validated JWT) | CLAUDE.md mandate | Already canonical in `apps/web/app/page.tsx` |
| `fetch` with custom cache layers | `fetch(url, { next: { revalidate } })` | Next 13 stable; Next 16 hardened | Use built-in for build-log |
| `useEffect` + `fetch` for client data | Server Components + ISR | Next 13.4+ | BuildLog is Server Component |
| Custom typing animation libs | Motion 12 `<Typewriter>` OR vanilla FSM | Motion 12 (2026) | UI-SPEC §7b mandates vanilla; don't reach for `<Typewriter>` |

**Deprecated/outdated:**
- `next/legacy/image`: not used here
- `@supabase/auth-helpers-nextjs`: project already on `@supabase/ssr`; do not regress
- `pg` driver: project on `postgres` per CLAUDE.md; do not introduce
- `framer-motion` import: do not use; use `motion/react`

---

## Open Questions

1. **What's the production URL for the `metadata.openGraph.url` field?**
   - What we know: Project deploys to Vercel; hyperpolymath.com is a plausible domain
   - What's unclear: Whether the domain is configured / which is canonical
   - Recommendation: Planner asks Filippo during plan-phase. Default to `https://hyperpolymath.com` if no answer.

2. **Should `filippofonseca.com` footer link be verified against the actual URL?**
   - What we know: UI-SPEC §9 hardcodes `filippofonseca.com →`
   - What's unclear: Whether that URL resolves to a working site
   - Recommendation: Planner verifies during plan-phase. If broken, ask for replacement.

3. **What goes in `strict-tool-use.fixture.ts`?**
   - What we know: Must be a real input → strict-tool-use JSON example from JARVIS
   - What's unclear: Whether to lift from a live `jarvis_events` row, canonicalize from `tools.test.ts`, or hand-author
   - Recommendation: Lift the canonical README example ("dinner with anna 8pm saturday. buy her flowers friday afternoon") and re-run it once locally against the live JARVIS pipeline; copy the resulting tool_use blocks into the fixture file. This gives the most credible "verbatim from the source of truth" claim.

4. **Does the `.hud-streaming-caret` class exist in globals.css?**
   - What we know: UI-SPEC §7b step 1 references it; the code example above falls back to `animate-pulse`
   - What's unclear: Did Phase 6.1 ship this utility?
   - Recommendation: Planner greps globals.css; if missing, add a 4-line `@keyframes` block + class for the caret pulse (already a pattern in the codebase).

5. **What's the existing `lib/db/client.ts` connection — is the role actually `postgres` (RLS bypass) or `authenticated`?**
   - What we know: Pattern in `actions/*.ts` is Drizzle bypass of RLS (existing convention)
   - What's unclear: Whether the planner needs to budget for a Drizzle role switch
   - Recommendation: Confirm via `psql $DATABASE_URL -c "SHOW SESSION AUTHORIZATION"` during plan-phase. Treat existing pattern as canonical; do NOT change in this phase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All build steps | ✓ (project requires ≥20.9) | per `package.json` engines | — |
| pnpm | Install + scripts | ✓ | 9.12.0 (per root `package.json`) | — |
| Supabase project | Waitlist table, RLS migration, Server Action | ✓ (already provisioned, all prior phases use it) | — | — |
| Anthropic API key | NOT used by landing — JARVIS demo is replay only | n/a | — | — |
| `GITHUB_TOKEN` env var | BuildLog GitHub API call (classic PAT, public-repo scope) | ✗ (must be added) | — | Soft degrade to unauthenticated (60/hr/IP); or skip commits feed entirely per D-10 |
| Vercel deploy | Production hosting + ISR + outputFileTracingIncludes | ✓ (current deploy target) | — | — |
| `.planning/ROADMAP.md` accessible at build | BuildLog Block 1 (current phase parse) | ✓ (exists at repo root) | — | Render degraded variant (D-10) |
| `FRAMEWORK.md` at repo root | Primitives table anchor links (D-08) | ✗ (must be created in this phase) | — | Links would 404 — must ship |
| `apps/web/app/opengraph-image.png` | OG meta tag | ✗ (must be created in this phase) | 1200×630 PNG | Next 16 fallback: no OG image tag, just description |
| `packages/jarvis-core/tests/strict-tool-use.fixture.ts` | EngineSection JSON contract (UI-SPEC §11e) | ✗ (must be created in this phase) | — | Cannot ship without — UI-SPEC gate would fail |

**Missing dependencies with no fallback (planner MUST include in plan):**
- `FRAMEWORK.md` at repo root — D-06 explicitly named
- `apps/web/app/opengraph-image.png` — Lighthouse/SEO best practice
- `packages/jarvis-core/tests/strict-tool-use.fixture.ts` — UI-SPEC §11e gate

**Missing dependencies with fallback:**
- `GITHUB_TOKEN` — falls back to graceful degradation per D-10. Add to `.env.example` and document setup; add to Vercel project env vars.

---

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json` — section SKIPPED per researcher contract.

---

## Project Constraints (from CLAUDE.md)

The planner MUST honor these directly:

- **Use `motion/react`, NEVER `framer-motion`** (the old import is in maintenance) — JarvisDemo uses `motion/react`
- **Use `getClaims()`, NEVER `getSession()` in server code** — `page.tsx` already does
- **Use Drizzle for queries; `supabase-js` for everything else** — waitlist insert is Drizzle; supabase-js only handles the cookie auth check in `page.tsx`
- **Use `postgres` driver, NOT `pg`** — already the project default
- **TypeScript strict mode** — non-negotiable
- **Tailwind 4 with `@theme` + `@variant dark`** — landing CONSUMES existing tokens, introduces ZERO new ones
- **No `--no-verify` on git commits** — applies to all phases
- **GSD Workflow Enforcement** — file changes go through GSD commands
- **Pre-commit hooks must pass** — Biome lint must succeed
- **Test framework: Vitest 3.x** — but `nyquist_validation: false` so no Vitest gate on this phase
- **Never hand-roll auth, never use Supabase Vault for these tokens** — irrelevant to landing
- **`anonymous-write Supabase` pattern is NEW for this project** — research above documents the canonical shape

---

## FRAMEWORK.md Content Outline (Q6 resolution)

Based on the nanoGPT / micrograd README pattern (simplicity, readability, fork-as-runbook) translated through hyperpolymath's voice:

**Section 1: What this is (2-3 paragraphs)**
- Personal life-OS spec, distilled from one user (Filippo) using v1 for 18 months + v2 for 6 months
- Five primitives + one agent contract
- Not a product pitch — a framework for building your own
- Voice match: README's "Why Hyperpolymath" section, slightly more technical

**Section 2: The Five Primitives (one subsection each — anchors target IDs are `#areas`, `#projects`, `#captures`, `#jarvis`, `#calendar`)**
Each subsection has:
- One-paragraph definition
- The role it plays (what it FOR vs what it's NOT for)
- The Drizzle schema (typed columns, with brief comments) — copy directly from `lib/db/schema.ts`
- One or two real-world examples
- Pitfalls / why it's shaped this way

**Section 3: The Agent Contract (`#jarvis-agent-contract`)**
- One input → N actions via Anthropic Strict Tool Use
- The 5 tool shapes (`create_task`, `create_capture`, `create_event`, `remember_fact`, `ask_clarification`) — link to `packages/jarvis-core/src/tools/` for the Zod definitions
- The capture-first principle (ambiguity → capture, not clarification)
- The deterministic date pre-parser (chrono-node, server-side)
- The prompt-caching architecture (Anthropic system prompt cache_control)

**Section 4: The Data Model (one ASCII architecture diagram + commentary)**
- Lift the README §Architecture ASCII diagram
- Explain the load-bearing decisions (gcal as source of truth NOT mirrored; userId scoping from day one; Drizzle for queries vs supabase-js for everything else)

**Section 5: How to Fork**
- `git clone`
- `pnpm install`
- `cp .env.example .env.local` — list required envs (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, GOOGLE_*, optional GITHUB_TOKEN)
- `pnpm db:migrate`
- `pnpm dev`
- What to change first: edit `apps/web/app/(app)/` and `lib/db/schema.ts` for your own primitives

**Section 6: What I Learned (optional — 3-5 short observations)**
- The single biggest mistake from v1 (probably: building Firebase-first, not Postgres-first)
- The single biggest insight from v2 (probably: agent contract makes the entire UX coherent)
- Why open source (commitment, not convenience — verbatim from README)

**Section 7: License & Attribution**
- MIT
- Renaissance trade-dress note (verbatim from README)
- Acknowledgments (Karpathy for nanoGPT model, Anthropic for Sonnet 4.6)

**Target length:** 250-400 lines. Mostly prose. ~1500-2500 words. Reading time: 8-12 minutes. Forkable in the same sense nanoGPT is — a person could read it once, decide "I want this," and have a starting point.

**Anchor IDs (load-bearing for UI-SPEC §5c table):**
- `#areas`
- `#projects`
- `#captures`
- `#jarvis`
- `#calendar`

These must exist as GitHub-renderable markdown anchors (auto-generated from `## Areas` / `## Projects` / `## Captures` / `## JARVIS` / `## Calendar` H2 headings).

---

## Sources

### Primary (HIGH confidence)
- `apps/web/package.json` — verified all dependency versions in stack
- `apps/web/app/layout.tsx` — verified font wiring (EB Garamond + JetBrains Mono via next/font/google)
- `apps/web/app/page.tsx` — verified current redirect pattern
- `apps/web/lib/db/schema.ts` — verified Drizzle table patterns
- `apps/web/supabase/migrations/0001_rls_policies.sql` + `0011_jarvis_facts.sql` — verified RLS pattern (per-table CREATE POLICY pairing with Drizzle schema)
- `apps/web/app/actions/captures.ts` — verified Server Action shape (Zod + getClaims + Drizzle transaction)
- `apps/web/app/globals.css` — verified existing tokens (`--canvas`, `--ink`, `--edge-hud`, `--hud-cyan` family, `--ease-out-quart`, `.font-mono-stats`, `.custom-scrollbar`)
- `apps/web/lib/supabase/server.ts` — verified async cookies pattern (Next 16)
- `apps/web/next.config.ts` — verified current config (transpilePackages set)
- `pnpm-workspace.yaml` — verified monorepo structure (`apps/*` + `packages/*`)
- `README.md` — verified canonical voice + ASCII demo block + roadmap markers
- `.planning/phases/08-public-landing-manifesto/08-CONTEXT.md` — locked decisions D-01..D-13
- `.planning/phases/08-public-landing-manifesto/08-UI-SPEC.md` — approved visual contract
- `.planning/ROADMAP.md` — Phase 8 entry + 9 success criteria + Progress table format

### Secondary (MEDIUM-HIGH confidence — verified with official sources)
- [Next.js Docs — Guides: ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration) — `fetch(..., { next: { revalidate } })` canonical pattern
- [Next.js Docs — Functions: fetch](https://nextjs.org/docs/app/api-reference/functions/fetch) — per-call revalidate hint
- [Next.js Docs — How Revalidation Works](https://nextjs.org/docs/app/guides/how-revalidation-works) — stale-while-revalidate failure mode (cached value continues serving on background revalidation failure)
- [Next.js Docs — next.config.js: output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) — outputFileTracingRoot + outputFileTracingIncludes for monorepo file inclusion
- [Next.js Docs — Metadata Files: opengraph-image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) — static .png file convention
- [Next.js Docs — Getting Started: Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) — openGraph/twitter must be set explicitly (do not auto-inherit)
- [GitHub Docs — Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — 60/hr unauthenticated, 5,000/hr authenticated (verified current as of 2026)
- [GitHub Docs — Updated rate limits for unauthenticated requests](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/) — 2025 changelog confirming current 60/hr limit
- [Supabase Docs — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — anon role policy semantics
- [Supabase Docs — RLS Simplified](https://supabase.com/docs/guides/troubleshooting/rls-simplified-BJTcS8) — WITH CHECK semantics for INSERT policies
- [Motion Docs — Typewriter](https://motion.dev/docs/react-typewriter) — Motion 12 ships `<Typewriter>` (intentionally NOT used per UI-SPEC §7b)
- [Motion Docs — useReducedMotion hook](https://motion.dev/docs/react-use-reduced-motion) — official reduced-motion gate
- [Karpathy nanoGPT README](https://github.com/karpathy/nanoGPT) — the canonical "README IS the landing page" prior art (referenced for FRAMEWORK.md outline)

### Tertiary (LOW confidence — useful but not directly cited as fact)
- Vercel Community thread on file resolution in monorepos — corroborates outputFileTracingIncludes pattern but reports historical brittleness
- GitHub Issue #46697 (vercel/next.js) — historical outputFileTracingIncludes path-resolution bug; flag for vigilance

---

## Metadata

**Confidence breakdown:**
- Q1 ISR pattern: HIGH — Next 16 official docs are explicit
- Q2 GitHub API auth: HIGH — official GitHub Docs + 2025 changelog
- Q3 ROADMAP.md from monorepo: MEDIUM-HIGH — pattern is documented but historically brittle (Issue #46697); fallback path in code example mitigates
- Q4 Supabase anon write: HIGH — verified existing codebase RLS pattern + Supabase docs + Drizzle pooler bypass nuance
- Q5 Motion typing: HIGH for `useReducedMotion` + AnimatePresence; MEDIUM for "vanilla FSM > `<Typewriter>`" (judgment, but UI-SPEC §7b prescribes it)
- Q6 FRAMEWORK.md outline: MEDIUM — exemplar-driven (nanoGPT), no objective right answer
- Q7 OG image: HIGH — Next 16 file convention is unambiguous
- Q8 Route group: HIGH — codebase already uses `(app)`; one-file landing doesn't earn `(public)` group
- Standard stack: HIGH — verified from package.json
- Architecture: HIGH — verified from existing patterns
- Pitfalls: HIGH on 1-7 (verified or grounded in docs); MEDIUM on 8-10 (judgment / verification deferred to planner)

**Research date:** 2026-05-25
**Valid until:** ~2026-06-25 (Next 16 + GitHub API limits are stable; Supabase RLS patterns are stable; Motion 12 may iterate but our usage is conservative)
