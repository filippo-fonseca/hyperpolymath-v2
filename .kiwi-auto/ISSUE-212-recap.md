# Issue #212 — skipped

**Title:** Task project linkage update from Jarvis integration fails
**Labels:** bug, integration, kiwi-drafted

## Why skipped

Fails the doability rules for unattended 45-minute sessions on multiple axes:

1. **Root cause unknown by author's own admission.** The issue body says: "The root cause is currently unknown and requires investigation." That is an investigation ticket, not a scoped fix. Investigation-only tickets are exactly the shape the doability rules tell us to leave out.
2. **No reproduction steps.** There is no example Jarvis utterance, no failing request/response, no stack trace, no server log excerpt, no captured error toast. Without a repro, an unattended session cannot verify the fix.
3. **Multi-surface by nature.** "Jarvis → Hyperpolymath task project linkage update" spans at least: the Jarvis tool grammar / dispatch, the tool executor for updating a task's `projectId`, the tasks server route / Drizzle mutation, realtime invalidation, and the task UI feedback. Any of those could be the failure point, and touching them speculatively is high risk.
4. **Open acceptance criteria requiring judgment.** "Add appropriate error handling or user feedback if the integration call fails" is a UX call; "Cover the fix with relevant tests" depends on where the fix lands. Both need product/design input the unattended session cannot get.
5. **Risk of a wrong-place fix.** Guessing at a root cause and shipping a patch to the wrong layer would obscure the real bug and burn the one 45-minute slot on unverifiable code.

## Recommended next step (for a human session)

- Reproduce end-to-end: capture the exact Jarvis utterance, the resulting tool call payload, the server log line, and the current DB row for the target task.
- From that, decide whether the failure is in tool-grammar / arg parsing, in the mutation handler, in RLS, or in realtime invalidation, and scope a targeted PR from there.

Leaving branch untouched aside from this recap commit.
