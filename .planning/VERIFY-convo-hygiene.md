# VERIFY — JARVIS desktop conversation hygiene

Loop-2 fixes for the three HUD conversation-panel complaints. Worktree:
`hp-wt-studio-integration`, branch `bgsd/studio-native`.

## Complaint 1 — "Weird messages load by default" on boot

### Root cause (confirmed)

The desktop HUD transcript (`#transcript` in `apps/desktop/index.html`) is
**live-DOM only**. Every bubble is built with `document.createElement` in
`apps/desktop/src/main.ts` (`appendUserTurn`, `startJarvisTurn`,
`appendJarvisDelta`, `paintTranscript`). There is NO localStorage / plugin-store
persistence of turns and the SSE events route
(`apps/web/app/api/jarvis/physical/events/route.ts`) does NOT replay history on
connect — it only sends `hello`. So a cold boot paints nothing.

The stale turns are not painted on boot; they leak into the **agent's memory**:

- `apps/web/lib/jarvis/recent-history.ts` — `buildRecentHistory(userId)` reads
  the `jarvis_turns` table for the last `HISTORY_WINDOW_MS` (15 min), capped at
  `HISTORY_MAX_TURNS` (12), and threads those turns into the model context.
- `apps/web/app/api/jarvis/voice/transcript/route.ts` and
  `.../voice/text/route.ts` call `buildRecentHistory` on every turn when the
  client sends no `history` of its own. The desktop's `postText` sends none, so
  the server fallback always applies.
- Test turns fired via curl to `/api/jarvis/voice/*` persist into the same
  `jarvis_turns` table, so the next real desktop turn inherits them as context —
  JARVIS references a stale/test exchange even though the HUD looked empty.

A parallel Explore-agent sweep independently reached the same conclusion (no
boot-time paint/replay; the leak is `buildRecentHistory` reading `jarvis_turns`).

## Complaint 2 — "Need to be able to clear convo from scratch"

Added a Clear control (mono font, hairline border, cyan hover) in a slim toolbar
strip above the transcript, revealed only once the transcript has content.

What Clear wipes (`clearConversation()` in `apps/desktop/src/main.ts`):

1. Visible transcript DOM — removes every `.turn` bubble, drops `has-content`,
   resets all turn-pairing + optimistic pointers (`currentReplyBody`,
   `turnPairState`, `jarvisTurnAwaitingUser`, `optimisticUserTurn/Body`) and the
   drawer QA mirrors.
2. Server-side memory — `clearHistory()` (`apps/desktop/src/api/client.ts`) POSTs
   to the new `POST /api/jarvis/voice/history/clear`
   (`apps/web/app/api/jarvis/voice/history/clear/route.ts`), which deletes all
   `jarvis_turns` rows for the caller. Owner-gated via the existing desktop
   bearer (`validateDesktopBearerIdentity` + `isOwnerUser`), matching every other
   paired-device voice route. The button disables for the round-trip.

This is what makes "clear from scratch" actually reset the agent's memory
(the recency window that was surfacing stale/test turns), not just blank bubbles.

## Complaint 3 — "Remove the initial default message sent"

No hardcoded default/seed/greeting chat message is injected into the transcript
at boot. Grep for painted greeting strings (`Hi|Hello|Welcome|Good morning|...`)
found none reaching `appendUserTurn`/`paintTranscript`.

The one synthetic turn that exists is the proactive briefing prompt
`"Daddy's home. Give me my briefing, sir."`
(`apps/desktop/src/briefing/briefing.ts`), but it is NOT a boot-time default:
`runBriefing()` fires only from `maybeRunStartupSequence()`
(`apps/desktop/src/startup/sequencer.ts`) on the FIRST wake, and only when the
`startupBriefingEnabled` setting is on. That is a deliberate, user-toggleable
feature, explicitly out of scope per the brief ("only remove an actual injected
chat message"). The orb idle hint "Press Talk to JARVIS…" is left untouched.

So there was no stray default message to remove; the leftover-clutter symptom
was the `jarvis_turns` memory covered by complaints 1 + 2.

## Verification (all green)

Run from `apps/desktop` unless noted.

- `pnpm typecheck` (desktop) → exit 0
- `pnpm vitest run` (desktop) → 16 files, 92 tests passed
- `pnpm vite build` (desktop) → built in ~2.5s, exit 0
- `pnpm typecheck` (apps/web, touched by the new route) → exit 0

## Commits (branch bgsd/studio-native)

- feat(jarvis): add owner-gated clear-conversation-memory route
- feat(desktop): add clearHistory API client for conversation reset
- feat(desktop): add Clear-conversation control to HUD chrome
- feat(desktop): wire Clear button to wipe transcript + server memory
