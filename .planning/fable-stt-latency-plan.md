# Fable plan — JARVIS STT latency (44–89s per turn)

Investigated 2026-07-05 on branch `next`. Real backend test run against Groq
(throwaway script `/tmp/groq-stt-test.mjs`, not committed). Verdict below is
empirical, not inferred.

## 1. Test results

3s synthetic WAV, 16 kHz mono 16-bit (94 KB), 3 runs per model. Control:
`GET /v1/models` = 99–180 ms (network + auth fine, matches Conductor's check).

| Call | Latency | Status | Key rate-limit headers |
|---|---|---|---|
| models list (control) ×2 | 99–180 ms | 200 | — |
| `whisper-large-v3-turbo` ×3 | 145–467 ms | **429** | `retry-after: 44`, `x-ratelimit-limit-requests: 2000`, `x-ratelimit-remaining-requests: 0`, `x-ratelimit-reset-requests: 24h0m0s` |
| `whisper-large-v3` ×3 | 329–499 ms | **200** | `remaining-requests: 1999`, `limit-audio-seconds: 7200`, fresh bucket |
| `distil-whisper-large-v3-en` ×3 | 194–549 ms | 400 | model **decommissioned** on Groq |

BYOK check: one `user_api_keys` row for provider `groq`, `last4 = ytyW` — **same
key as `GROQ_API_KEY` in `apps/web/.env.local`**. No key mismatch; the route and
this test exercised the identical key/org (`org_01ks44nfzwer4tjpfzavthcm…`).

**Verdict: not Groq-wide, not network, not the server/tools/DB. It is a
per-model daily rate-limit exhaustion on `whisper-large-v3-turbo` for this
key's org, amplified by silent SDK retry backoff.**

## 2. Root cause

Two stacked causes:

1. **The 44s/89s itself**: `whisper-large-v3-turbo` returns 429 with
   `retry-after: 44`. The route builds `new Groq({ apiKey })` with **default
   SDK options** (`maxRetries: 2`, honors `retry-after`), at
   `apps/web/app/api/jarvis/voice/transcript/route.ts:84`. So the SDK sleeps
   44s and retries invisibly: one 429→sleep→success = ~44.5s (`stt 44467ms`,
   `stt 45004ms`); two sleeps = ~89s (`stt 88709ms` ≈ 2×44s). The route's own
   try/catch never sees an error until all retries burn.

2. **Why the quota is gone**: the desktop idle wake-phrase listener probes STT
   every **2.2 s** (`WAKE_PROBE_INTERVAL_MS = 2_200`,
   `apps/desktop/src/wake/wake-probe.ts:35` → `probeBufferTail`,
   `apps/desktop/src/audio/capture.ts:57-68`) with **no energy gate** — it
   transcribes pure silence, ~1,600 requests/hour, each a ~5 s audio tail.
   That exhausts the free-tier turbo bucket (2,000 requests/day AND 7,200
   audio-seconds/day) in roughly an hour of idle listening. Every real voice
   turn after that eats the 429+44s retry dance.

## 3. Fix implementation plan

### Fix A (server, the latency fix) — fail fast + model fallback
File: `apps/web/app/api/jarvis/voice/transcript/route.ts`

1. **Line 84** — construct the client with explicit limits:
   ```ts
   const groq = new Groq({ apiKey: groqKey, maxRetries: 0, timeout: 15_000 });
   ```
   `maxRetries: 0` kills the silent 44s retry-after sleep; `timeout: 15_000`
   caps a genuinely slow inference call (normal is <1s for ≤15s audio).

2. **Lines 89–103** — wrap the transcription in a tiny model-fallback chain:
   try `whisper-large-v3-turbo`; on ANY error (429, timeout, 5xx) immediately
   retry once with `whisper-large-v3` (empirically a **separate** quota bucket,
   ~330–500 ms). Log which model served the turn plus the 429 detail
   (`err.status`, `err.headers?.["retry-after"]`) so future exhaustion is
   visible in `[voice-timing]` logs. Do NOT add `distil-whisper-large-v3-en`
   (decommissioned). Suggested shape:
   ```ts
   const STT_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;
   let transcription; let lastErr;
   for (const model of STT_MODELS) {
     try { transcription = await groq.audio.transcriptions.create({ file, model, response_format: "json", language: "en" }); break; }
     catch (err) { lastErr = err; console.warn(`[voice-timing] stt ${model} failed status=${(err as any)?.status}`); }
   }
   if (!transcription) throw lastErr;
   ```
   Worst case becomes ~0.5–15 s instead of 44–89 s; typical 429 case ~0.7 s.
   The `x-jarvis-probe` path shares this code and needs no special-casing
   (probe failures are already fail-open on the desktop side).

### Fix B (desktop, the quota fix) — stop transcribing silence
File: `apps/desktop/src/audio/capture.ts` (`probeBufferTail`, lines ~57–68)

Add an RMS energy gate before encoding/POSTing, reusing the existing
`computeRms` + VAD threshold (0.01, `apps/desktop/src/audio/vad.ts:9,102`):
```ts
if (computeRms(tail) < 0.01) return null; // silence — don't burn STT quota
```
(`computeRms` is already imported in capture.ts.) A dorm room is silent most
of the day; this cuts the probe volume by >90 % and is the difference between
exhausting the daily quota in ~1 h vs. it lasting indefinitely. Optionally also
bump `WAKE_PROBE_INTERVAL_MS` 2_200 → 3_000 (`wake-probe.ts:35`); secondary,
the gate is the real fix.

### Fix C (design only, env-gated) — non-Groq STT fallback
Not required to fix today's incident (Fix A's model chain already provides an
in-provider fallback), so keep this as a follow-up: in route.ts, after the
Groq chain fails entirely, if `STT_FALLBACK_PROVIDER=openai` and
`OPENAI_API_KEY` are set, POST the same WAV to OpenAI
`/v1/audio/transcriptions` with `model: "whisper-1"` via plain `fetch`
(no new SDK dep). Ship only if Groq-wide outages actually occur.

### Non-fixes / ruled out
- Audio payload: 16 kHz mono 16-bit, VAD hard-cap 15 s ⇒ ≤ ~480 KB per turn.
  Fine; no change needed.
- Key/auth/network: control call 99–180 ms; BYOK key == env key.
- DB pool / personality-config changes: downstream of STT, confirmed innocent.
- UX "one moment" toast: unnecessary once Fix A caps STT at ~15 s worst case.

### Ops note (no code)
The org's turbo bucket resets 24 h after exhaustion; until Fix B ships, turns
will ride the `whisper-large-v3` fallback (fast, but its own 2,000/day bucket
will also drain if the ungated probe keeps running). Ship A+B together.
Upgrading the Groq account to the paid dev tier raises both limits and is a
reasonable belt-and-braces step, but is not a substitute for the energy gate.
