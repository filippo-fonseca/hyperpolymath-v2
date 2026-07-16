# Fable investigation — JARVIS latency inconsistency + iMessage double-send

You are a Fable investigator. INVESTIGATE and PLAN only — do NOT edit code. Keep it
CONTAINED and medium-effort: read only the files named below (plus what they directly
reference), reason carefully, and write a concise root-cause + fix plan. Do not sprawl
across the repo, do not run the app, do not waste tokens on unrelated code.

Working tree (branch `next`): /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-routines-test

Write your output to: `.planning/fable-latency-plan.md` (concise: root cause per issue,
then a concrete, minimal fix plan per issue with file:line targets). That's the only file
you create.

## Live evidence (from a real test session, already gathered — trust it)

### Issue 1 — INCONSISTENT LATENCY (the big one)
Symptom: in one session, "What time is it?" and "Do the Red Sox play today?" EACH took ~1
minute — both the user's transcript echo AND the spoken response were slow. The THIRD
command (an iMessage) was fast. User suspects a warm/cold effect.

Web server log facts:
- COLD turn: `POST /api/jarvis/voice/transcript 200 in 45s` alongside `[jarvis] cache read/create pass=1 15711 2089` (2089 = cache CREATION tokens).
- WARM turn: `POST ... in 637ms` alongside `[jarvis] cache read/create pass=1 17799 0` (0 creation = full READ of the 17799-token prefix).
- A warm-up route was recently added to pre-create the cache at desktop boot + wake:
  `apps/web/app/api/jarvis/voice/warmup/route.ts`. Its log line reads
  `[warmup] cache read/create 15711 0` — i.e. it READS 15711 and CREATES 0. Note the
  mismatch: real turns' full prefix is ~17799 and the cold delta they create is ~2089,
  but the warm-up only touches 15711 and creates nothing. STRONG hypothesis to test:
  the warm-up is NOT reproducing the exact same cacheable prefix the real turn uses (a
  prefix/parameter mismatch), so it fails to pre-create the ~2089-token system-prefix
  chunk — meaning the user's FIRST real turn still pays the cold cost. Figure out WHY the
  warm-up prefix differs from the real turn's prefix, and what it takes to make them
  byte-identical so the warm-up actually eliminates the cold turn.
- ALSO investigate: even with the `after()` change in the transcript route (turn runs in
  `after()` so the POST should return early), some POSTs still show ~45s. Does Next.js dev
  actually flush the response before `after()` completes, or does the POST still block for
  the whole turn in dev? If it blocks, the transcript echo + mic-release are still turn-
  bound. Determine whether the fix should instead paint the user's transcript from the SSE
  `"transcript"` event (emitted ~1s in `apps/web/lib/voice/physical-extension/bus.ts`,
  event name "transcript") which the desktop `apps/desktop/src/physical-extender/sse-client.ts`
  currently does NOT listen for.

Files to read for Issue 1 (and only these + direct refs):
- apps/web/app/api/jarvis/voice/warmup/route.ts
- apps/web/app/api/jarvis/voice/transcript/route.ts
- apps/web/lib/jarvis/prompt-builder.ts  (the cached prefix + cache_control breakpoint placement)
- apps/web/lib/jarvis/run-turn.ts  (how the REAL turn builds system/tools/cache_control; the `[jarvis] cache read/create` log)
Compare EXACTLY how run-turn builds the cached prefix vs how warmup builds it. Identify
every parameter/block that differs (e.g. voiceActive flags, facts, projects, userDisplayName,
tool set, cache_control ttl/placement). The goal: a precise list of what to change so the
warm-up creates the identical cache the first real turn will read.

### Issue 2 — iMessage DOUBLE-SEND (safety)
Symptom: user said "Send a message to Rohan ... we're at the library." JARVIS read it back
("shall I send it, sir?"). The message was sent TWICE: once AT the readback (before the user
said "Yes"), with the text suffixed "(Sent via Jarvis)"; and AGAIN after the user said "Yes"
(no suffix). Two messages delivered. The confirm-gate dedupe (`lastSent` recipient+text within
30s) did NOT catch the duplicate because the two sends had DIFFERENT text (the "(Sent via
Jarvis)" suffix on the first vs none on the second).

Note: a recent fix (`hasUnnegatedSendVerb`, commit 9fda68e) narrowed the confirm predicate so
a "send a message to X" REQUEST should no longer pre-confirm. Yet a send still fired at readback.
So either (a) something ELSE causes the readback-time send, or (b) the two model turns each emit
a send_message with different text and BOTH get dispatched. Investigate:
- Why a send dispatches at readback time (before the spoken "Yes"). Trace holdSendMessage's
  pre-confirm branch and resolvePendingWithTranscript.
- Why the model emits the message text with a "(Sent via Jarvis)" suffix on one emission and
  not the other (this defeats the exact-text dedupe). Is it the single-turn vs two-turn
  SEND_MESSAGE guardrail in packages/jarvis-core/src/personality.ts causing a re-emit with
  different text?
- Propose a robust fix so a confirmed send delivers EXACTLY ONCE: e.g. dedupe on
  recipient + NORMALIZED text (strip a trailing "(Sent via Jarvis)"-style signature and
  collapse whitespace) and/or a per-pending "already dispatched" latch keyed by the pending
  action identity rather than exact text, so a re-emitted tool call for the same logical send
  can't double-fire. Keep all existing confirm-gate safety invariants intact.

Files to read for Issue 2:
- apps/desktop/src/actions/confirm-gate.ts  (holdSendMessage, resolvePendingWithTranscript, executeSend, dedupe via lastSent, dispatchAndReport, and the recent iMessage-resolution wiring)
- packages/jarvis-core/src/personality.ts  (the SEND_MESSAGE guardrail + any "Sent via Jarvis" signature instruction)

## Output shape (concise — this is the whole deliverable)
`.planning/fable-latency-plan.md` with:
1. Issue 1 root cause (why warm-up prefix ≠ real prefix; why latency is inconsistent) + a minimal fix plan (exact prefix/param changes; whether to add SSE transcript paint).
2. Issue 2 root cause (why the double-send + why dedupe misses) + a minimal fix plan (normalized dedupe and/or dispatch latch).
Keep each section tight. No code edits. No unrelated exploration.

## ADDITIONAL LIVE OBSERVATION (critical — factor this into Issue 1)
The latency is NON-DETERMINISTIC within a single session, same code path: after the user
says "Yes" to confirm a send, SOMETIMES JARVIS sends + responds RIGHT AWAY (near-instant),
and SOMETIMES it takes a minute+ before it sends and speaks. It is not a clean
first-turn-slow / rest-fast pattern — a LATER turn (e.g. the 4th, a WhatsApp send well after
warm-up) was also slow, and an earlier one was fast. Also: the user's TRANSCRIPT ECHO (their
own words appearing) is slow on essentially EVERY slow turn, not just cold ones — which
suggests the echo is bound to the /voice/transcript POST returning, and the POST is blocking
for the whole turn even though the turn was moved into `after()` (so `after()` likely does NOT
detach the response in Next dev). Treat the ECHO as an always-slow, decouple-from-the-POST
problem (paint from the SSE "transcript" event ~1s) SEPARATELY from the inconsistent RESPONSE
latency. For the RESPONSE inconsistency, the key question is: what VARIES between a fast turn
and a slow turn in the same warm session? Prime suspects to evaluate: (a) the 1h prompt cache
being invalidated mid-session (e.g. extractAndPersistFacts mutating jarvis_facts and the facts
text landing before the cache breakpoint on SOME turns), (b) cache TTL/creation races, (c) the
warm-up prefix not matching so the cache is only ever partially warm, (d) cold DB pool
re-acquire. Pin down the concrete cause of the fast/slow non-determinism.
