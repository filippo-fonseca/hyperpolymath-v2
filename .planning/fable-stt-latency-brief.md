# Fable investigation — JARVIS STT latency (44–89s per turn)

You are a Fable investigator. INVESTIGATE with a REAL BACKEND TEST, then produce a concrete
IMPLEMENTATION PLAN to fix it. Keep it CONTAINED and focused; do not sprawl. Do NOT edit
application code (planning + a throwaway test script only). Write your output to
`.planning/fable-stt-latency-plan.md`.

Working tree (branch `next`): /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-routines-test

## The problem — already ISOLATED to STT (trust this, then confirm with a test)
Every JARVIS voice turn takes ~44–89 SECONDS. The Conductor added `[voice-timing]` logs and
they pin the bottleneck precisely to the SPEECH-TO-TEXT step, NOT the server/tools/DB/model:

```
[voice-timing] stt 44467ms          ← the Groq Whisper transcription call
[voice-timing] stt 45004ms
[voice-timing] stt 88709ms          ← ~2×44s, i.e. a RETRY
[voice-timing] setup 13ms           ← everything AFTER stt (history, key, config load, prompt build) is instant
[jarvis] cache read/create 18266 0  ← prompt cache warm, model turn fine
POST /api/jarvis/voice/transcript 200 in 45s (application-code: 45s)
```

So: `groq.audio.transcriptions.create(...)` is taking 44–89s. Setup is 13–27ms, cache is warm,
the model/tools/DB are NOT the cause. The recent DB-pool and personality-config changes are
downstream of STT and are NOT the culprit.

Already checked by the Conductor: the Groq API + key are HEALTHY — `GET https://api.groq.com/openai/v1/models`
returns `200 in 0.25s` with a valid key. So it is NOT auth or network reachability. The slowness
is specific to the AUDIO TRANSCRIPTION inference endpoint. The ~44s consistency and the 89s≈2×44s
pattern strongly suggest either (a) the `whisper-large-v3-turbo` model is degraded/queued/throttled
for this key/tier, or (b) the Groq SDK is retrying a slow/failing call with backoff.

## The STT code to read
- `apps/web/app/api/jarvis/voice/transcript/route.ts` — the Groq client construction (`new Groq({ apiKey })`),
  the `groq.audio.transcriptions.create({ file, model: "whisper-large-v3-turbo", ... })` call (~line 90),
  and the `[voice-timing] stt` log. Note the model, any timeout/maxRetries on the Groq client, the
  audio file format/size being sent (the desktop encodes 16kHz WAV — check what's uploaded), and
  whether `x-jarvis-probe` requests share the same path.
- `apps/desktop/src/audio/capture.ts` + the API client `postTranscript` — what audio is encoded and
  POSTed (format, sample rate, duration cap). A bloated/long WAV could slow STT, though 44s is extreme
  for a short utterance.
- Any Groq SDK config (maxRetries, timeout) — `@groq/groq-sdk` defaults to retries with backoff; a
  slow first attempt + retry would produce the 44s / 89s pattern.

## RUN A REAL BACKEND TEST (this is the core ask — isolate server vs voice, empirically)
Write a THROWAWAY node script (e.g. `/tmp/groq-stt-test.mjs`, do NOT commit it) that:
1. Reads `GROQ_API_KEY` from `apps/web/.env.local`.
2. Generates or uses a short (~2–4s) sample WAV at 16kHz mono (you can synthesize one with a tone or
   silence via a tiny WAV writer, or find a small existing sample in the repo/test fixtures — a real
   short spoken clip is ideal but a synthetic WAV still measures the endpoint latency).
3. POSTs it to Groq's transcription endpoint and TIMES it, for these variants, several runs each:
   - model `whisper-large-v3-turbo` (current),
   - model `whisper-large-v3` (non-turbo),
   - model `distil-whisper-large-v3-en` (fastest) if available.
   Capture the wall-clock per call AND the response headers (esp. `x-ratelimit-*`, `retry-after`,
   any queue/`x-groq-*` timing headers). Report which model is fast vs slow, and whether rate-limit
   headers indicate throttling.
4. Also time a bare `models` list call as the control (should be ~0.25s).
This empirically answers the user's question: is it the server(JARVIS/tools/DB) or the voice(STT)?
— the timing logs already say STT; the test CONFIRMS whether it's Groq-wide, model-specific, or
key/rate-limit-specific.

## Produce the fix implementation plan (`.planning/fable-stt-latency-plan.md`)
Based on the test results, give a CONCRETE, minimal implementation plan. Consider (recommend the
best-fit, with file:line targets):
- Switch STT model if turbo is the degraded one (e.g. to `whisper-large-v3` or `distil-whisper-large-v3-en`).
- Set an explicit Groq client `timeout` + sane `maxRetries` so a slow call FAILS FAST and either
  retries quickly or falls back — never a silent 44–89s hang. Pick concrete numbers.
- A FALLBACK STT provider path (e.g. OpenAI Whisper, Deepgram, or local whisper.cpp) if Groq is
  slow/unavailable — at least a design, gated behind an env flag.
- Reducing audio payload (confirm the WAV isn't huge; cap duration; correct sample rate/encoding).
- Surfacing STT latency to the user (a fast "one moment" if STT >Ns) as a UX stopgap — secondary.
Be explicit about what to change, where, and why, so an Opus executor can implement it directly.

## Output shape
`.planning/fable-stt-latency-plan.md`:
1. Test results table (model × latency × rate-limit headers) + the verdict (Groq-wide vs model vs key).
2. Root cause statement.
3. Concrete fix implementation plan with exact file:line targets and specific config values.
Keep it tight. No app-code edits (throwaway test script only, uncommitted).
