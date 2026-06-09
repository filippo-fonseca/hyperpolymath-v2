# Phase 8: Public Landing Manifesto - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 08-public-landing-manifesto
**Areas discussed:** Demo modality · Page density · Fork-door depth · Build-log source & freshness · Sign-in door
**Discussion style:** Prose (per user feedback memory — design Q&A uses conversational text, not chip selection)

---

## Demo Modality

| Option | Description | Selected |
|---|---|---|
| (a) Replay | Pure CSS/Motion animation of README ASCII block. No API call, no auth, zero runtime cost. Loops on click. | ✓ |
| (b) Curated stream | Same UI as (a) but real JARVIS API calls on a fixed/curated prompt set. ~1 day, public demo-mode API route, pennies per demo. | |
| (c) Interactive | Visitor types own sentence, sees real routing. Anonymous rate-limited. Multi-day, introduces abuse vectors + cost concerns + anon-user auth contortions. | |

**User's choice:** Recommendation accepted via "all five are fine." (c) explicitly deferred to backlog.
**Notes:** Reasoning given to user — Karpathy/Tan landing pages are confident demonstrations, not interactive demos. Replay ships the manifesto without scope balloon. (c) becomes a Phase 999.x backlog candidate ("interactive jarvis playground") if appetite returns post-launch.

---

## Page Density

| Option | Description | Selected |
|---|---|---|
| Sparse | 1-3 sentences per section + one visual element. 60-90 second read. Pure manifesto energy. | ✓ |
| Moderate | One paragraph per section + visual. 3-4 minute read. More substantive, still scsamble. | partial (Engine only) |
| Dense | Multi-paragraph sections. 8-10 minute read. Most essay-like. | |

**User's choice:** Sparse, with one moderate exception — **The Engine** section (Strict Tool Use + real JSON contract gets a paragraph).
**Notes:** User said "Karpathy vibe but not necessarily essay-based" — sparse is the natural read. Engine is the technically-substantive section that earns the manifesto its credibility, so it gets the extra weight.

---

## Fork-Door Depth

| Option | Description | Selected |
|---|---|---|
| Light | "View on GitHub" button only. Fork claim is rhetorical, not substantive. | |
| Medium | Button + new `FRAMEWORK.md` committed to the repo that explicitly names the primitives as a spec. Forkable in spirit AND in code. | ✓ |
| Heavy | Button + new `/manifesto` longform essay route on the site itself. Landing is the broadside; `/manifesto` is the pamphlet. | |

**User's choice:** Medium. Ship `FRAMEWORK.md` to repo root next to `README.md`; landing's "Fork it" button links to GitHub repo.
**Notes:** Matches the Karpathy/nanoGPT pattern — README is the landing page. Repo IS the framework write-up; no new site route needed. Cleanest "use mine OR build yours" stance.

---

## Build-Log Source & Freshness

| Option | Description | Selected |
|---|---|---|
| Live GitHub API | Server Component fetches commits per render. Live data, ~200ms cost per render unless cached. | |
| Build-time snapshot | Script generates JSON at deploy from `.planning/ROADMAP.md` + local `git log`. Zero runtime cost. Fresh on every deploy. | |
| ISR every N min | Cached GitHub fetch, regenerated in background ~5 min. Snappy + reasonably live. | |
| Hybrid | Phase from `.planning/ROADMAP.md` at build (editorial), commits from GitHub via ISR (~10 min, live). | ✓ |

**User's choice:** Hybrid. Phase status is editorial (controlled via ROADMAP.md commits, no API dependency); commits are live via ISR. Graceful degradation if GitHub fetch fails.
**Notes:** Best of both worlds — editorial control where it matters (phase status), automation where it helps (commit feed). Failure mode is gentle: just render the roadmap-derived phase line if GitHub is unavailable.

---

## Sign-In Door

| Option | Description | Selected |
|---|---|---|
| Real Google OAuth | Stranger signs in, lands in empty `/today`. Honest about being a working app but weird UX. | |
| Waitlist | Email capture; copy honest about being single-user during build-in-public. Multi-user coming later. | ✓ |
| "DM me" / private alpha | Link to Twitter/email. Most build-in-public-feeling. | |
| Hide entirely | Only "Fork it" door is real. Code IS the offering (purest Karpathy stance). | (noted as deferred alt) |

**User's choice:** Waitlist. Email capture stored in new `waitlist` table; copy is honest about single-user truth. Real Google OAuth preserved via quieter "Already have an account?" link.
**Notes:** "Hide entirely" was offered as the purer Karpathy move and explicitly noted as a deferred alternative — revisit if waitlist signal proves low-value or noisy post-launch.

---

## Claude's Discretion

- Visual treatment specifics (ornament dividers, drop caps, paragraph rhythm, exact cyan accent placement) — deferred to `/gsd:ui-phase 08`
- Microcopy for section headings and body text — Claude drafts, user reviews in ui-phase
- Exact two-or-three rotating demo sentences for D-03 — drafted by Claude in plan-phase, user reviews before execute
- Footer composition (MIT badge, link to personal site, layout) — Claude's call
- Whether cyan accent appears at all on the landing (strong lean toward minimal use — only on JARVIS demo's action receipts) — TBD in ui-phase

## Deferred Ideas

- Interactive JARVIS playground (Phase 999.x backlog candidate post-launch)
- `/manifesto` longform essay route (revisit if manifesto-essay angle gains weight)
- "Hide sign-in door entirely" alternative to waitlist (revisit if waitlist signal is low-value)
- Dynamic OG image generator (`@vercel/og`) — static OG image for now
- Analytics / pageview tracking (Plausible, Vercel Web Analytics) — revisit when desired
- A/B testing thesis copy — explicit reject (inappropriate for build-in-public manifesto)
