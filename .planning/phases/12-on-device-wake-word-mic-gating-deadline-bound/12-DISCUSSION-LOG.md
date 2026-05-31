# Phase 12: On-Device Wake-Word + Mic Gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `12-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 12-on-device-wake-word-mic-gating-deadline-bound
**Areas discussed:** Listening modes & hibernate semantics; Cut-over strategy under deadline; First-enable UX cost; Wake-word confidence threshold

---

## Listening Modes & Hibernate Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Discreet stays as a separate quick toggle; 3-mode picker is the deep setting | Two parallel controls (Discreet = TTS mute only; 3-mode = wake-word/PTT/hibernate) | |
| (b) Discreet subsumed into "push-to-talk only" mode | One less header control | |
| (c) Discreet keeps Phase 7 behavior (TTS + wake-word silence); 3-mode is persistent; Discreet is temporary override | Two parallel controls but Discreet is temporary | |
| (custom) Drop "Hibernate" entirely — Discreet IS the third mode | wake-word / push-to-talk / Discreet (= TTS muted + no wake-word); PTT always works in every mode | ✓ |

**Hibernate sub-question:** Does `Cmd+Shift+J` PTT work in hibernate?

| Option | Selected |
|--------|----------|
| Yes — PTT always works (preserves Phase 7 VOICE-09) | ✓ |
| No — hibernate truly disables voice (kills PTT too) | |

**User's choice:** "in hibernate, the command Shift J, pressing the talk will still work. It's not truly off." + "discrete toggle existing, sure, it can be with discrete, which is kind of the same as hibernate, right?" + "It just needs to allow me to talk to Jarvis through wake word, talk to Jarvis through non-wake word, and it still talks back, and then talk to Jarvis/text it and it doesn't talk back, and that's discrete."

**Resolution:** Claude collapsed Hibernate into Discreet (they had functionally identical behavior given the PTT-always-works constraint). Three modes: wake-word / push-to-talk / discreet. Header Discreet button kept as a quick shortcut to/from Discreet mode. Fully disabling voice remains accessible via Settings → `Enable voice` toggle.

**Notes:** User explicitly delegated naming/structure decision ("you figure it out"). Claude chose to drop "Hibernate" terminology to remove naming inconsistency — the behavior matrix justifies the collapse. Documented as D-01 + D-02 in CONTEXT.md.

---

## Cut-Over Strategy Under Deadline Pressure

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Hard cut-over | One PR rips Porcupine, adds openWakeWord. No A/B. | ✓ |
| (b) Feature-flag dual-stack | Ship openWakeWord behind a flag, validate ~1 week side-by-side, then remove Porcupine. ~2× wiring code. | |

**User's choice:** "we can do the first option, option A, whatever is easier."

**Notes:** Deadline-bound (2026-06-30 hard, 2026-06-15 internal). User explicitly accepted no A/B trade-off in exchange for less code. Documented as D-03 in CONTEXT.md.

---

## First-Enable UX Cost (3-4 MB ONNX/WASM lazy-load)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Plain spinner with "Loading voice assets…" in enable modal | Simple, downloads only when user opts in | ✓ |
| (b) Background-preload after sign-in | No wait when user toggles; wastes bandwidth for users who never enable voice | |
| (c) Progressive — audition step immediately, wake-word load in parallel, gate "Enable" on completion | Hides wait behind audition UI | |

**User's choice:** "it doesn't matter if I have to wait, but yeah, spinner and whatever, just some sort of loader thingy."

**Notes:** User indifferent to wait time. Picked Option A for simplicity. Documented as D-04 in CONTEXT.md.

---

## Wake-Word Confidence Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Locked at 0.5 | No user control; bet on default being right | ✓ |
| (b) Hidden dev knob in localStorage | Tunable for Filippo only, no Settings UI clutter | |
| (c) 3-tier user picker (Sensitive 0.4 / Balanced 0.5 / Strict 0.7) in Settings | Visible user control over false-fire / miss tradeoff | |

**User's choice:** "For number 4, confidence threshold, you choose. fixed prob?"

**Notes:** User delegated to Claude with a lean toward Option A. Claude picked Option A (locked 0.5) — premature UI for a problem that may not exist. Documented as D-05 in CONTEXT.md with a fallback path: if real-world false-fires or misses emerge, file a 999.x backlog item to add the 3-tier picker. Decision is reversible.

---

## Claude's Discretion

The following were explicitly handed to Claude for plan-time decision:

- Settings → Voice picker UI vocabulary (radio group / segmented control / dropdown)
- Per-mode descriptions copy
- Spinner visual treatment (match Phase 6.1 / Anthropic-discipline loading states)
- Header Discreet button visual state when in Discreet mode
- Worker file location (likely `apps/web/public/workers/`)
- ONNX/WASM asset paths (likely `apps/web/public/wake-word/`)
- Telemetry hook — whether to add `wake_word_fire_at` stage to Phase 9 telemetry (defer if non-trivial)

## Deferred Ideas

Surfaced during discussion or scope-adjacent. Tracked in `12-CONTEXT.md` `<deferred>` section:

- Tunable confidence threshold (file as 999.x backlog if needed post-ship)
- Wake-word phrase customization (would require openWakeWord training pipeline — defer indefinitely)
- A/B telemetry against Porcupine (forfeit by hard cut-over)
- `wake_word_fire_at` stage (Claude's discretion at plan time)
- Multi-user wake-word presets (post-MVP per PROJECT.md)
- Voice-driven Read/Update/Delete (backlog 999.3)
- Ambient context inference (Phase 7 deferred, remains so)
- Browser-tab interrupt/stop control (absorbed into Phase 14, not Phase 12)
