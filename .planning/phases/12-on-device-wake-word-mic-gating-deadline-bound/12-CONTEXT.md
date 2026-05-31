# Phase 12: On-Device Wake-Word + Mic Gating - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 replaces Phase 7's Picovoice Porcupine wake-word with on-device openWakeWord (ONNX runtime in a Web Worker) before the Porcupine free-tier sunsets **2026-06-30**, and exposes a three-mode listening picker (wake-word / push-to-talk / discreet) in Settings → Voice. All audio stays on-device until the wake-word classifier fires; the entire Picovoice dependency surface (npm package, env var, code paths) is removed in the same phase.

**Scope anchor:** This phase delivers the 6 WAKE-* requirements (WAKE-01..06). New capabilities (multi-user voice presets, voice-driven Read/Update/Delete, ambient context inference, in-browser voice memos) remain deferred — see `<deferred>`.

**Hard deadline:** Picovoice free tier sunsets 2026-06-30. Internal cut-over target 2026-06-15 (2-week safety margin per ROADMAP).

</domain>

<decisions>
## Implementation Decisions

### Listening Modes & Mic Gating

- **D-01:** **Three mutually-exclusive listening modes** in Settings → Voice. Hibernate (originally proposed) is dropped — Discreet absorbs it:

  | Mode | "Hey Jarvis" | `Cmd+Shift+J` PTT | TTS speaks back |
  |------|--------------|-------------------|-----------------|
  | **Wake-word** (default) | ✓ | ✓ | ✓ |
  | **Push-to-talk** | ✗ | ✓ | ✓ |
  | **Discreet** | ✗ | ✓ | ✗ |

  Reasoning: user explicitly stated `Cmd+Shift+J` PTT must work in every listening mode ("it's not truly off"). The original WAKE-05 "hibernate" mode is therefore equivalent to a TTS-muted PTT state, which is precisely what Discreet already meant in Phase 7. Collapsing them removes naming inconsistency and one extra mode.

  **Fully disabling voice** remains accessible via the existing `Enable voice` toggle in Settings → Voice (unchanged from Phase 7). That path tears down the wake-word worker entirely and releases the mic.

- **D-02:** **Header Discreet button kept as a quick shortcut to Discreet mode.** Tap toggles between user's previous mode and Discreet, then back. Preserves the Phase 7 D-01 two-element header pattern (status dot + Discreet button); no chrome regression.

### openWakeWord Cut-Over Strategy

- **D-03:** **Hard cut-over** (no feature flag, no dual-stack). One PR rips `@picovoice/porcupine-react@4.0.0` from `package.json` and replaces the `apps/web/lib/voice/wake-word.ts` implementation + `JarvisListener.tsx` / `DiscreetToggleButton.tsx` wiring with openWakeWord (`onnxruntime-web` + Silero VAD + `hey_jarvis_v0.1.onnx`) in a Web Worker.

  Reasoning: deadline-bound (30 days, 2-week safety margin to 2026-06-15) — the dual-stack alternative would add ~2× wiring code for code we'd remove before the deadline anyway. Accept the loss of A/B against Porcupine's pre-trained model; if openWakeWord accuracy regresses, tune via the confidence threshold (D-05) post-ship or swap the ONNX model file without re-architecting.

- **D-04:** **First-enable spinner** during the **~8.5-14.5 MB** ONNX/WASM lazy-load (per 12-RESEARCH.md §Asset Weight — `hey_jarvis_v0.1.onnx` 1.27 MB + `melspectrogram.onnx` 1.09 MB + `embedding_model.onnx` 1.33 MB + `silero_vad.onnx` 1.81 MB + ORT WASM 3-9 MB). Inline spinner + "Loading voice assets…" copy inside the existing Enable Voice modal (D-02 from Phase 7's eager modal flow). No background preload — voice assets only download when the user actually opts in, which keeps first paint untouched for users who never enable voice. Browser cache makes second-load instant; first-load on slow networks may take 5-15s, so the spinner copy should set expectation.

### Wake-Word Sensitivity

- **D-05:** **Locked 0.5 confidence threshold** over 2 consecutive 80 ms frames (the WAKE-02 spec value). No Settings UI, no localStorage developer knob, no Sensitive/Balanced/Strict picker. Premature UI for a problem that may not exist with openWakeWord's `hey_jarvis_v0.1.onnx`.

  **Fallback path:** If real-world testing surfaces false-fires or misses, file a 999.x backlog item to add a 3-tier tunable. Document this fallback in the SUMMARY so future-Claude knows the discretion is reversible.

### Claude's Discretion

- Settings → Voice picker UI vocabulary — radio group vs segmented control vs dropdown. Pick whatever fits the existing settings page idiom (likely radio group to match Phase 6.1 HUD-discipline forms).
- Per-mode descriptions in Settings — short copy beneath each option explaining the behavior matrix. Lean factual ("Always listens for 'Hey Jarvis'. Cmd+Shift+J also works. JARVIS speaks back."), not marketing.
- Spinner visual treatment — match Phase 6.1 / Anthropic-discipline loading states (no novel pattern).
- Header Discreet button visual state when in Discreet mode — likely a filled / accented variant of the existing button (Phase 6.1 cyan).
- Worker file location — `apps/web/public/workers/wake-word.worker.js` (or `.ts` if Next 16 + Turbopack handles it cleanly) — match existing `public/worklets/clap-detector.js` placement convention.
- ONNX/WASM asset paths — `apps/web/public/wake-word/` for the model + VAD + ONNX runtime WASM (lazy-loaded on first enable). Cache headers and bundling strategy: pick whatever fits Vercel's static asset defaults.
- Telemetry hook — extend `voice-stage-collector.ts` to emit a `wake_word_fire_at` stage timestamp (optional — falls back to existing recording stage if not added). Decide at plan time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 source-of-truth (read these in this order)
- `.planning/ROADMAP.md` §"Phase 12: On-Device Wake-Word + Mic Gating (DEADLINE-BOUND)" — goal + 6 success criteria + deadline pressure
- `.planning/REQUIREMENTS.md` §WAKE-01 through §WAKE-06 — locked requirement contracts

### Inherited from Phase 7 (voice substrate — DO NOT redefine)
- `.planning/phases/07-jarvis-voice-ambient/07-CONTEXT.md` — Phase 7 voice contract. Reuse:
  - D-01 (two-element mic chrome pattern: status dot + Discreet button in PersistentNav)
  - D-02 (eager modal onboarding for "Enable voice" — Phase 12's spinner lives inside this modal)
  - D-05 (always-listening default once voice is enabled — Phase 12's wake-word mode inherits)
  - VOICE-09 (Cmd+Shift+J PTT always works — Phase 12's D-01 mode matrix preserves this)
  - VOICE-12 (barge-in semantics — Phase 12 wake-word fire integrates here)
  - VOICE-14 (capture-first defense for adversarial transcripts — WAKE-04's stripWakeWordAnywhere is belt-and-braces)
- `.planning/phases/07-jarvis-voice-ambient/07-RESEARCH.md` — original wake-word vendor matrix (Porcupine vs openWakeWord vs Whisper-tiny). Re-read the openWakeWord notes — they cover ONNX setup, model file sources, frame-size math.

### Inherited from Phase 11 (cache + telemetry compatibility)
- `.planning/phases/11-prompt-cache-state-priming/11-VERIFICATION.md` — Phase 11 cache architecture. Phase 12 wake-word fires must NOT introduce silent cache invalidators in `apps/web/scripts/cache-invalidator-gate.mjs` ALLOWLIST. Any new prompt-touching code goes through the same gate.
- `.planning/phases/09-latency-telemetry-baseline/09-VERIFICATION.md` — Phase 9 telemetry stages. If Phase 12 adds a `wake_word_fire_at` stage, update `jarvis_events` schema + `voice-stage-collector.ts` accordingly (or defer to a follow-up).

### Project-level constraints
- `CLAUDE.md` (project root) — stack non-negotiables: Next.js 16, no global stores (rules out Zustand/XState for the wake-word state machine — extend Phase 7's `useReducer` mic-state FSM), `@supabase/ssr` patterns
- `.planning/PROJECT.md` — core value, voice-mode constraints, single-user-architecturally
- `.planning/STATE.md` — current execution state

### Code surface (read before touching)
- `apps/web/lib/voice/wake-word.ts` — Porcupine integration to be REPLACED (D-03 hard cut-over)
- `apps/web/lib/voice/mic-state-bus.ts` — event bus; wake-fire event continues to flow here
- `apps/web/lib/voice/mic-state.ts` — 5-state FSM (idle/listening/recording/thinking/speaking) — extend, don't replace
- `apps/web/lib/voice/use-voice-settings.ts` — voice-settings hook; add listening-mode persistence here
- `apps/web/components/voice/JarvisListener.tsx` — Phase 7 listener; wake-fire path is rewired here
- `apps/web/components/voice/JarvisListenerMount.tsx` — gates whether listener mounts at all (key for D-01 mode-aware mounting)
- `apps/web/components/voice/DiscreetToggleButton.tsx` — header Discreet button (kept per D-02; semantics shift to "shortcut to Discreet mode")
- `apps/web/components/voice/EnableVoiceModal.tsx` — eager modal (Phase 7 D-02); spinner from D-04 lives inside here
- `apps/web/components/voice/PressToTalkButton.tsx` — PTT entry; must work in every mode (D-01)
- `apps/web/public/worklets/clap-detector.js` — AudioWorklet placement convention reference
- `apps/web/package.json` — `@picovoice/porcupine-react@4.0.0` to remove (WAKE-06)

### External docs / vendor refs (downstream researcher should pull current versions)
- openWakeWord (David Scripka): https://github.com/dscripka/openWakeWord — README + `hey_jarvis_v0.1.onnx` source
- `onnxruntime-web` (Microsoft): https://onnxruntime.ai/docs/tutorials/web/ — Web Worker integration + WASM hosting
- Silero VAD: https://github.com/snakers4/silero-vad — VAD model + integration patterns
- Phase 7's `07-RESEARCH.md` already captured the npm landscape — researcher re-confirms versions at plan time

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 7 mic-state FSM** (`useReducer`, 5 states) — Phase 12 wake-word fire continues to dispatch into this; no new state machine
- **Phase 7 mic-state-bus** — event bus already routes wake-fire to the listener; rewire to openWakeWord worker output
- **AudioWorklet pattern** — `public/worklets/clap-detector.js` is the canonical placement; wake-word AudioWorklet for the ring buffer follows the same shape
- **Enable Voice modal** — Phase 7's eager modal already gates first-enable UX; D-04 spinner lives inside it without structural changes
- **EnableVoiceModal + DiscreetToggleButton + MicIndicatorDot** — existing Phase 7 voice chrome; only `DiscreetToggleButton` semantics change (D-02)
- **`use-voice-settings.ts`** — voice settings hook + localStorage persistence already in place; extend with `listeningMode: 'wake-word' | 'push-to-talk' | 'discreet'`

### Established Patterns
- **localStorage for voice settings** — Phase 7 chose localStorage over Supabase persistence (single-user app, no DB round-trip on every state read). Listening mode follows the same pattern.
- **`pointer-fine` Tailwind variant** — hover-reveal patterns gate on fine pointer; Settings → Voice picker hover affordances respect this
- **Capture-first defense (JARVIS-06/14)** — wake-fire transcripts inherit; WAKE-04 `stripWakeWordAnywhere` is the belt-and-braces second pass
- **Web Worker + AudioWorklet pairing** — no existing precedent in this codebase; Phase 12 establishes the pattern (will inform Phase 13/14)
- **CACHE-05 grep gate** — any new code that touches prompt construction passes the silent-invalidator scanner; openWakeWord runtime is downstream of prompt-builder so this should be a non-issue, but verify at plan time

### Integration Points
- `apps/web/public/wake-word/` — NEW asset directory: `hey_jarvis_v0.1.onnx`, Silero VAD model, `onnxruntime-web` WASM files (lazy-loaded)
- `apps/web/public/workers/wake-word.worker.js` (or `.ts`) — NEW Web Worker for the openWakeWord runtime + ring buffer pre-roll splice
- `apps/web/lib/voice/wake-word.ts` — REPLACED entirely (Porcupine → openWakeWord worker spawner + message protocol)
- `apps/web/lib/voice/use-voice-settings.ts` — EXTENDED with `listeningMode` field + persistence
- `apps/web/components/voice/JarvisListener.tsx` — REWIRED to consume new wake-fire events from worker
- `apps/web/components/voice/JarvisListenerMount.tsx` — EXTENDED to mount/unmount based on listening mode (wake-word + PTT mount the listener; Discreet still mounts for PTT but not for wake-word)
- `apps/web/app/(app)/settings/page.tsx` (or current voice section host) — EXTENDED with 3-mode picker
- `apps/web/components/voice/DiscreetToggleButton.tsx` — SEMANTICS-CHANGED to "quick shortcut to/from Discreet mode" (not a separate TTS+wake mute)
- `apps/web/components/voice/EnableVoiceModal.tsx` — EXTENDED with asset-load spinner (D-04)
- `apps/web/package.json` — REMOVED `@picovoice/porcupine-react` (WAKE-06)
- `.env` / `.env.local` — VERIFIED no `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` references remain (WAKE-06)

</code_context>

<specifics>
## Specific Ideas

- **Modes terminology** — three labels: **Wake-word** / **Push-to-talk** / **Discreet**. "Hibernate" terminology dropped (replaced by Discreet which already meant "TTS muted").
- **Discreet mode behavior** — TTS silenced (no spoken receipts), wake-word disabled (no ambient mic listening), but `Cmd+Shift+J` PTT still triggers recording + JARVIS responds via text Console + receipts only.
- **Header Discreet button** — quick toggle that flips between user's previous mode and Discreet. Visual state should make "currently in Discreet" obvious (filled cyan vs outline cyan, or similar — Claude's discretion).
- **No fourth "fully off" mode** — toggling `Enable voice` off in Settings remains the path to fully kill voice (matches Phase 7 behavior).
- **Confidence threshold** — `0.5` over 2 consecutive 80 ms frames. Not user-tunable. If real-world tuning is needed post-ship, file a 999.x backlog item for a 3-tier Sensitive/Balanced/Strict picker.
- **Cut-over scope** — single PR (or single phase): Porcupine removal + openWakeWord wiring happen together. No transitional dual-stack.
- **Pre-roll** — 500 ms spliced from the 3-second ring buffer (WAKE-03 spec value) so "Hey Jarvis add buy milk" in one breath captures "add buy milk" intact.
- **Asset load UX** — spinner inside the existing Enable Voice modal (Phase 7 D-02). No background preload at sign-in.

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion or are scope-adjacent but belong in other phases. Captured here so they're not lost.

- **Tunable confidence threshold (Sensitive / Balanced / Strict)** — file as 999.x backlog if openWakeWord's accuracy creates real-world friction. Reversible decision; not premature now.
- **Wake-word phrase customization** — Phase 7 mentioned `.ppn` files for Porcupine custom phrases. openWakeWord requires training custom models, which is much heavier. Defer entirely — "Hey Jarvis" is the only phrase for Phase 12 and likely indefinitely.
- **A/B telemetry against Porcupine** — explicitly forfeit by the hard cut-over (D-03). If post-ship accuracy concerns surface, the comparison is with our own historical Porcupine telemetry from Phase 7, not a live dual-stack.
- **`wake_word_fire_at` telemetry stage** — Claude's discretion at plan time. May ship in Phase 12 if cheap; otherwise defer.
- **Multi-user wake-word presets** — voice mode is single-user-coded; multi-user wake-word phrase per user is post-MVP per PROJECT.md.
- **Voice-driven Read/Update/Delete** — backlog 999.3 (jarvis-read-layer). Independent of wake-word substrate.
- **Ambient context inference** — JARVIS overhearing background conversation without wake-word fire. Privacy red flag; explicitly dropped in Phase 7 deferred and remains so.
- **Browser-tab interrupt/stop control** (was backlog 999.7) — absorbed into Phase 14 (Desktop Shell + Global Hotkey), not Phase 12.

</deferred>

---

*Phase: 12-on-device-wake-word-mic-gating-deadline-bound*
*Context gathered: 2026-05-31*
