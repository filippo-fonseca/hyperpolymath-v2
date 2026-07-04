# Plan — imessage-send-harden

## Goal
Harden `buildIMessageSend` in `apps/desktop/src/actions/applescript.ts` with:
1. SMS-service fallback so green-bubble contacts still receive the message.
2. Group / chat-id targeting when the recipient string looks like a chat id.

Do not change `SendMessageAction`, the dispatcher, or the confirm-gate flow. Normal
single-recipient iMessage sends must be byte-identical in behavior.

## Design

### Recipient shape detection (in TS, before script build)
Detect chat-id shape with a simple, conservative regex — everything else stays on
the participant path so the common case cannot regress.

- Chat id heuristic: `/^(iMessage|SMS);[+-];chat/i` or a bare `/^chat[0-9A-F-]{6,}$/i`
  (the two forms `Messages.app` exposes for `text chat id`).
- Anything not matching → treat as a single participant (phone / email / handle).

### AppleScript branches

**Chat-id branch (group or 1:1 chat by id)** — no SMS fallback needed; the chat id
already encodes the service:

```applescript
tell application "Messages"
  set targetChat to text chat id "<recipient>"
  send "<text>" to targetChat
end tell
```

**Participant branch (default)** — try iMessage first, fall back to SMS on error:

```applescript
tell application "Messages"
  try
    set targetService to 1st service whose service type = iMessage
    send "<text>" to participant "<recipient>" of targetService
  on error
    set smsService to 1st service whose service type = SMS
    send "<text>" to participant "<recipient>" of smsService
  end try
end tell
```

Both interpolated values continue to flow through `escapeAppleScript`.

## Verification
- `pnpm --filter desktop typecheck` must be green.
- Manual reasoning: for a plain phone/email recipient the produced script is the
  original one wrapped in `try … on error …`, so the healthy-path behavior is
  unchanged when the iMessage send succeeds.

## Non-goals
- No changes to `SendMessageAction`, `dispatcher.ts`, or `confirm-gate.ts`.
- No new tool schema, no new UI, no per-recipient service detection cache.
