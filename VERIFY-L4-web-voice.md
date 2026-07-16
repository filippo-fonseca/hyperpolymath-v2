# VERIFY — L4-A `web-voice-polish`

Branch `bgsd/studio-native` (integration worktree). Owns apps/web + packages/jarvis-core.

## Changes

1. **TTS speech sanitization** — `apps/web/lib/voice/sanitize-for-tts.ts` (new pure function),
   wired into `apps/web/app/api/jarvis/tts/route.ts` on the final text right before BOTH
   upstreams (ElevenLabs + Groq/Orpheus fallback). Rules: em/en/`--` dashes → `", "` (natural
   short pause, not the long dead air a raw dash gives), strip stray markdown (reuses
   `stripMarkdownForSpeech`), collapse repeated punctuation/whitespace, preserve ellipsis and
   quotes. A dash-only line sanitizing to empty is guarded as 400. Commit `9bd0d5a1`.

2. **Kill redundant CARD receipt** — the "WHATSAPP · SENT TO ..." card was model-emitted (no
   server-side path). Forbidden in the `card` widget tool description
   (`apps/web/lib/jarvis/studio-widget-tools.ts`) and the send_message personality guardrail
   (`packages/jarvis-core/src/personality.ts`): the WhatsApp widget IS the receipt and the
   desktop speaks the true outcome; cards are only for standalone content the user asked to see.
   Commit `2b9f29ae`.

## Verification

- `pnpm --filter web typecheck` → green (tsc --noEmit, no errors).
- `pnpm --filter web exec vitest run tests/sanitize-for-tts.test.ts` → 12/12 passed.

### Live receipts (dev server :3000, this worktree)

- **TTS em dash**: `POST /api/jarvis/tts` with `{"text":"I'm at the airport. — Jarvis"}`
  (desktop bearer) → **HTTP 200**, 102540 bytes `application/octet-stream` (PCM audio).
  The em dash is sanitized to a comma pause; no long gap, real audio synthesized.

- **Send turn, no card**: `POST /api/jarvis/voice/text` with
  `"tell Rohan test-ignore me, I'm testing, from Jarvis"` while subscribed to
  `/api/jarvis/physical/events` SSE. Result (turn `dbc619e2`): prose readback
  ("Sending that to Rohan now, sir." + "Awaiting your confirmation to send, sir.") and a
  single `send_message` tool call with `requires_confirm:true` (so NO message left the box).
  SSE stream contained **0** `studio_open_widget`, **0** `"kind":"card"`, **0** "SENT TO" —
  no redundant card receipt.
