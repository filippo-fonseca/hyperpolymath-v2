# Issue #38 recap — Fix Jarvis command palette (⌘K) networking issues

**Status:** skipped
**Branch:** `kiwi/auto/2026-06-16-issue-38` (untouched, only this recap committed)
**Pipeline:** `/gsd:quick` — abandoned at investigation stage; no plan, no code changes
**Issue:** [#38](https://github.com/filippo-fonseca/hyperpolymath-v2/issues/38) (left open)

## Why skipped

The issue is too ambiguous to fix safely in a bounded automated session. The body itself flags this:

> The exact failure mode is not fully specified but likely involves failed or unreliable network requests when the command palette is invoked.

There is no repro, no error message, no stack trace, no failing endpoint, no browser/network condition pinned down. The acceptance notes ask to "identify the root cause" — that is the load-bearing step, and it cannot be done from the issue body alone. This is an auto-generated Kiwi-drafted issue distilled from a short note, and the auto-generator transparently admits it does not know what Filippo was referring to.

The harness instructions for this run were explicit: **"If the issue is too large, architectural, ambiguous, or risky to do safely in one bounded session, DO NOT attempt it. Leave the branch untouched and instead write a skip recap explaining why."** This issue meets the ambiguous-and-risky bar.

## What was investigated (no code changed)

To rule out "obvious one-liner," I read the relevant surface area:

- `apps/web/components/shell/GlobalHotkeys.tsx` — owns ⌘K. It does **not** make any network request; it calls `focusJarvis()`, which just focuses the JARVIS input via a module-level singleton (`apps/web/lib/jarvis/focus.ts`). So "⌘K" itself is not a network site — the term "command palette" in the issue title is loose.
- `apps/web/components/shell/CommandMenu.tsx` — owns ⌘⇧K (capture composer), not ⌘K. Also no networking at open time.
- `apps/web/components/jarvis/JarvisInput.tsx`, `JarvisConsole.tsx`, `jarvis-stream-client.ts` — the actual networking happens when the user submits a turn after focusing the input. `streamJarvis()` does `fetch('/api/jarvis', …)` and consumes an SSE stream. Many other Jarvis endpoints exist (`/api/jarvis/voice/*`, `/api/jarvis/stt`, `/api/jarvis/tts`, `/api/jarvis/physical`, `/api/jarvis/warm`).
- `git log` on Jarvis paths — recent work has been Phase 16 CRUD + agentic loop + receipt persistence (`d42b159 fix(jarvis): receipts now persist — flushSync around capture-in-updater persists`, etc.). No commit in the recent history obviously points at a regression labelled "⌘K networking."

There is no single fetch that maps cleanly to "the ⌘K command palette networking issue." Without knowing whether Filippo means SSE drops, voice STT/TTS round-trips, warmup races, abort handling, or something else entirely, any code I wrote would be a guess that adds risk to a load-bearing surface (Jarvis is the core-value path per `CLAUDE.md`).

## What would unblock this issue

Before this is tractable in `/gsd:quick`, the issue needs one of:

- A repro: input typed, browser, network state, what failed, what was expected.
- A specific failing fetch: which URL, which response/status, which client console error.
- Or a narrowed scope: e.g. "add retries to `/api/jarvis/warm`," "add an abort+retry on `streamJarvis` when the SSE drops within Nms," "show a toast when `streamJarvis` returns `HTTP 5xx`."

A speculative "harden every Jarvis fetch with retries + toasts" change is exactly the kind of unbounded refactor the harness rules out: it touches a load-bearing surface, the bug it claims to fix is undefined, and the rollback story is muddy.

## What was NOT done

- No code edits.
- No `/gsd:quick` plan or task directory was created — bailed before Step 4.
- No `git push`, no destructive git.
- Branch `kiwi/auto/2026-06-16-issue-38` carries only this recap commit on top of `origin/main`.
- Issue #38 left **open** on GitHub (no `Closes #38` anywhere) — it stays in the backlog for Filippo to either provide a repro or close manually.

## Suggested next move (for Filippo, not for the automation)

When you hit the bug again, capture the browser devtools Network tab + console at the moment ⌘K (or the subsequent turn submit) misbehaves, paste that into a comment on #38, and re-run the auto-pipeline — at that point it becomes a real `/gsd:debug` candidate rather than a guess.
