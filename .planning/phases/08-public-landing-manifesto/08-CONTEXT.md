# Phase 8: Public Landing Manifesto - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A public-facing manifesto/marketing page at `/` for logged-out visitors that channels Karpathy-grade intellectual restraint through hyperpolymath's Garamond/paper/Renaissance voice. Logged-in users continue redirecting to `/today` (existing root-route behavior in `apps/web/app/page.tsx` preserved). The page itself is the build-in-public artifact — a single elegant scroll. Six sections, locked: **Thesis → Live JARVIS Demo → The Primitives spec → The Engine → The Choice → Build Log.**

**Not in scope (deferred — see `<deferred>` below):**
- Interactive JARVIS playground (visitor types own input → real routing)
- Multi-user sign-up flow (current architecture is single-user; waitlist instead)
- New `/manifesto` or `/about` route (landing IS the manifesto; framework write-up lives in `FRAMEWORK.md` at repo root)
- Dynamic OG image generation
- Analytics / pageview tracking

</domain>

<decisions>
## Implementation Decisions

### Demo Modality
- **D-01:** JARVIS centerpiece is a **pure CSS/Motion replay animation** of the README ASCII block (`README.md` lines 38-46 area). Cursor types the input verbatim ("dinner with anna 8pm saturday. buy her flowers friday afternoon"), then receipts stream in below ("⚜  scheduled  →  gcal · sat 8:00pm · Dinner with Anna", "⚜  created  →  task · fri afternoon · P2 · Buy flowers"). No API call, no auth, zero runtime cost.
- **D-02:** Respect `prefers-reduced-motion` — when set, render the final state directly with no animation.
- **D-03:** Two or three example sentences rotate (different action mixes — single task, multi-action, capture-only) so the demo doesn't feel canned. Rotation is client-side: visitor clicks "▶ show another" → next canned example. Drafted in plan-phase, reviewed by user before execute.

### Page Density
- **D-04:** **Sparse manifesto density.** Each section is 1-3 sentences plus one visual element (table, code block, ASCII art, the demo). Total read time target: 60-90 seconds top-to-bottom.
- **D-05:** **One exception: The Engine section** gets a paragraph (Strict Tool Use, why Sonnet 4.6) + the actual JSON contract shown — one real input → real schema-conforming JSON output, copied from a `jarvis-core` test fixture. This section earns the manifesto its technical credibility.

### Fork-Door Depth
- **D-06:** Ship a new **`FRAMEWORK.md`** at the repo root next to `README.md` that explicitly names the polymath-OS primitives as a small spec: Areas, Projects (including Classes), Captures, JARVIS (the agent contract), Calendar (gcal as source of truth). For each: what it is, what role it plays, the JSON shape (where relevant). Forkable in spirit AND in code.
- **D-07:** Landing's "Fork it" door is a single button linking to the GitHub repo. **No `/manifesto` or `/framework` route on the site itself.** The repo IS the framework write-up (Karpathy/nanoGPT pattern — README is the landing page).
- **D-08:** "The Primitives" section on the landing renders as a small spec table — primitive name, one-line description, anchor link to the corresponding section in `FRAMEWORK.md` on GitHub.

### Build-Log Source & Freshness
- **D-09:** **Hybrid model:**
  - **Current phase + status** parsed from `.planning/ROADMAP.md` at **build time** (read the "## Progress" table — rows marked `In Progress` become the "currently shipping" line). Always editorially accurate, zero runtime cost, no API dependency.
  - **Last 5-7 commits** pulled from `api.github.com/repos/filippo-fonseca/hyperpolymath-v2/commits` via a Server Component with **ISR `revalidate: 600`** (10 min). Always reasonably fresh, low API cost.
- **D-10:** **Graceful degradation:** if GitHub fetch fails (rate limit, network), render only the roadmap-derived phase line — never break the page.
- **D-11:** **"Shipped this week" line** computed at build/ISR time from the commit list (filter to commits with `feat(`/`fix(` prefix within last 7 days; show count + one-line summary of newest).

### Sign-In Door
- **D-12:** **"Use it" door is a waitlist.** Email capture stored in a new `waitlist` table (`id`, `email`, `note` nullable, `createdAt` — no `userId` since signups are anonymous). Copy is honest: *"v2 is single-user during build-in-public. Multi-user coming when the foundation is bulletproof."* Submit shows confirmation, optional one-line "what do you do?" follow-up field.
- **D-13:** Real Google OAuth sign-in flow (`/sign-in`) is preserved and accessible via a quieter "Already have an account? →" link under the waitlist form. Filippo signs in normally; waitlist is the path strangers see first.

### Claude's Discretion
- Visual treatment specifics (ornament dividers, drop caps, paragraph rhythm, exact cyan accent placement) — defer to UI-SPEC.md via `/gsd:ui-phase 08`
- Microcopy for each section heading and body — Claude drafts, user reviews during ui-phase
- The exact two-or-three rotating demo sentences for D-03 — Claude drafts in plan-phase, user reviews before execute
- Footer composition (MIT, link to personal site, license badge layout) — Claude's call
- Whether cyan accent appears at all on the landing — strong lean toward **minimal use** (only on JARVIS demo's action receipts, mirroring agent-mode-scope vocabulary). Final call in ui-phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (always-on)
- `.planning/PROJECT.md` — vision, principles, non-negotiables, open-source posture, brand voice ("I brought back the Renaissance")
- `.planning/STATE.md` — accumulated context, prior phase decisions, Phase 6.1 + 6.2 directional anchors
- `README.md` — the canonical voice template; landing extends this voice, does not invent new

### Aesthetic anchors (load-bearing — two prior visual contracts were rejected as "clunky and blah"; landing MUST inherit this discipline)
- `.planning/phases/06-polish/06-CONTEXT.md` — original polish intent
- `.planning/phases/06.1-visual-redesign-jarvis-notion/` — UI-SPEC.md and what got rejected as HUD-heavy (read the verification notes)
- `apps/web/app/globals.css` — design tokens (parchment / ink / HUD cyan family / academic intent inks, motion easing, focus rings, `@variant dark`, `@custom-variant pointer-fine`)
- `apps/web/app/layout.tsx` — EB Garamond + JetBrains Mono `next/font/google` setup (already wired; landing inherits)

### Current root-route behavior (must preserve logged-in redirect)
- `apps/web/app/page.tsx` — current redirect logic (`getClaims()` → `/today` or `/sign-in`). Becomes: logged-in unchanged; logged-out renders the manifesto instead of redirecting to sign-in.

### JARVIS demo source material
- `README.md` — the ASCII demo block (around line 38-46) that the landing animation must mirror verbatim
- `packages/jarvis-core/` — canonical JSON contract for D-05's Engine section. Pick one real fixture from `packages/jarvis-core/tests/` showing user-input → strict-tool-use JSON output. Don't invent; show the real thing.

### External references (research material for ui-phase)
- karpathy.ai — restraint reference (sparse pages, content-first, zero chrome)
- garrytan.com / Tan essays — manifesto-as-product voice
- linear.app/method — moderate-density chaptered scroll with strong typography
- levels.io — radical build-in-public transparency (metrics, raw text, no marketing) — *tone DOWN the chaos; borrow the honesty*
- github.com/karpathy/nanoGPT — README-as-landing-page prior art

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **EB Garamond + JetBrains Mono fonts** already loaded via `next/font/google` in `apps/web/app/layout.tsx` — no font setup needed
- **Design tokens** in `apps/web/app/globals.css` — parchment/ink palette, HUD cyan family, academic intent inks (amber/sage/coral), focus-ring tokens, motion easing tokens — landing consumes these, does not introduce new
- **Motion 12** (`motion/react`) in stack — use for the JARVIS demo typing animation and any scroll reveals
- **shadcn/ui primitives** (Button, etc.) available in `apps/web/components/ui/` — use for the two CTA doors ("Fork it" / "Use it")
- **Supabase server client** (`createClient` from `@/lib/supabase/server`) — already used in root `page.tsx` for the `getClaims()` check; reuse pattern
- **Drizzle schema** under `apps/web/lib/db/schema/*` — new `waitlist` table follows the same pattern: `id` (uuid pk), `email` (text not null unique), `note` (text nullable), `createdAt` (timestamp default now). No `userId` (anonymous signups).
- **next-themes** in providers — landing should respect light/dark per existing app theming, or be light-only — final call in ui-phase

### Established Patterns
- **Server Component for root route** — `apps/web/app/page.tsx` is async Server Component using `await createClient()` → preserve this; add the landing render in the unauthenticated branch
- **Tailwind 4 with `@theme` and `@variant dark`** — landing uses existing utility classes + tokens, no custom CSS file
- **RLS-enforced schema** — `waitlist` table is the exception (anonymous writes). Use a permissive INSERT policy scoped to the `anon` role with rate-limit considerations (or use a Server Action with service-role client to bypass RLS for the insert).
- **Server Actions** under `apps/web/app/actions/` — new `waitlist.ts` action for the email submission (Zod-validated, Drizzle insert)
- **ISR / caching** — no prior phase has used ISR; this introduces the pattern. Follow Next 16 conventions (`export const revalidate = 600`).

### Integration Points
- **Root route refactor:** `apps/web/app/page.tsx` — logged-in branch unchanged; logged-out branch renders `<LandingPage />` instead of redirecting. Manifesto components live in `apps/web/components/landing/`.
- **Waitlist Server Action:** new `apps/web/app/actions/waitlist.ts` for email submission. New migration generated via `pnpm db:generate` after schema add.
- **Build-log Server Component:** `apps/web/components/landing/BuildLog.tsx` — fetches GitHub commits with `revalidate: 600`; reads `.planning/ROADMAP.md` via `fs.readFileSync` at build time (or imports a small parser util).
- **No nav, no sidebar:** landing route does NOT use the `(app)` route group layout — it's a standalone document with its own minimal `<html><body>` shell (or the existing root layout, which has no chrome anyway — confirmed: root `layout.tsx` only wires fonts + providers).
- **`FRAMEWORK.md`** is a repo-root file, not under `apps/` — sits next to `README.md` and `LICENSE`. Authored as part of this phase, not after.

</code_context>

<specifics>
## Specific Ideas

- **The README's ASCII block is the demo source.** Not a new visual, not a recreation. Same monospace box, same actions, animated. Verbatim wording.
- **"⚜" (fleur-de-lis ornament)** from README is the canonical Renaissance accent for action receipts and section dividers. Already in use across the README — landing inherits.
- **README phrasing the landing inherits near-verbatim:** *"Type one sentence. The right action lands in the right place. Every time."* — this is the thesis.
- **Tagline in `apps/web/app/layout.tsx` metadata:** *"I brought back the Renaissance."* — stays; landing's `<title>` and OG description align.
- **Voice references (locked this turn):** Karpathy (sparse, content-first), Garry Tan (manifesto-as-product), Pieter Levels (raw build-in-public — *tone down the chaos*), Linear method page (moderate-density chaptered scroll), nanoGPT README (the "README IS the landing page" prior art).
- **What the landing is NOT:** Not a SaaS marketing page wearing a Renaissance costume. Not a wall of essay text. Not a feature-list-with-screenshots. Not "Sign up for Hyperpolymath today!" energy. Not interactive (the demo replays, doesn't accept input).
- **"Build in public" stance is load-bearing.** The build-log section is not decoration — it's the proof. If the build-log doesn't ship live, the manifesto's credibility collapses.

</specifics>

<deferred>
## Deferred Ideas

- **Interactive JARVIS playground** — visitor types own sentence, sees real routing against a sandboxed Sonnet 4.6 demo endpoint. Anonymous rate-limited. Multi-day scope, abuse surface, cost concerns. Backlog candidate ("interactive jarvis playground") if appetite returns post-launch.
- **`/manifesto` longform essay route** — separate page on the site that IS the framework write-up in essay form. Currently we ship `FRAMEWORK.md` to the repo instead (Karpathy/nanoGPT pattern). Revisit if post-launch the manifesto-essay angle gains weight.
- **"Hide the sign-in door entirely" alternative** — purer Karpathy stance (code IS the offering, no hosted access at all). Considered and noted as a potential pivot from D-12 if waitlist signal proves low-value or noisy.
- **Dynamic OG image generator** (`@vercel/og`) — out of scope; ship a static 1200x630 OG image instead. Dynamic generation is a polish item for a follow-up phase.
- **Analytics / pageview tracking** (Plausible, Vercel Web Analytics) — out of scope; revisit when the landing has been live for a while and signal is desired.
- **A/B testing thesis copy** — explicitly reject if it comes up. Not appropriate for a build-in-public manifesto.
- **Stretch JARVIS items deferred from backlog 999.2** (proactive briefings, anticipatory nudges, long-term memory) — orthogonal to landing; remain in backlog.

</deferred>

---

*Phase: 08-public-landing-manifesto*
*Context gathered: 2026-05-25*
