---
status: resolved
trigger: "JARVIS follow-up window does not close after 5 seconds — voice picks up arbitrary speech indefinitely on the Whisper-keyword fallback path."
created: 2026-05-30T16:00:00Z
updated: 2026-05-30T17:05:00Z
fix_commit: f5464e5
cleanup_commit: 55a3349
---

## Current Focus

hypothesis: H4 (CONFIRMED via instrumented trace) — clap detector AudioWorklet fires on plosive consonants in normal speech ('p', 't', 'k'), with 250-650ms inter-clap window two such peaks within ~half a second trigger onDoubleClap mid-utterance. The spurious DOUBLE_CLAP dispatch overwrites activationSource "wake-word" → "clap", moves FSM listening → recording, and makes onSpeechEnd fall through to the default branch (no wake-word gate) → transcript dispatched as command unconditionally.
test: Gate onDoubleClap on vadSpeakingRef — when VAD is currently detecting speech, suppress clap activation (claps are silence-gated by definition).
expecting: After fix, ambient speech outside the follow-up window will show source="wake-word" at onSpeechEnd, stripWakeWord returns null, silent discard.
next_action: Add vadSpeakingRef to JarvisListener, set true in onSpeechStart entry, false after vadEndAt capture in onSpeechEnd, gate onDoubleClap. Commit. Re-verify with user. Strip diagnostics. Move debug file to resolved/.

## Symptoms

expected: After JARVIS finishes responding to a voice command, the 5s wake-word-free follow-up window opens. After 5 seconds with no further user speech, the window closes and the system returns to passive listening — random ambient speech (no wake phrase) should be silently discarded (not sent to /api/jarvis, not transcribed as a command). Saying "buy milk" 10 seconds later should do NOTHING.
actual: "Whatever I say, even more than five seconds later, it'll pick it up as a thing." The system processes arbitrary post-window speech as commands. Window never effectively closes.
errors: No console errors mentioned. Behavioral bug only.
reproduction:
  1. Open http://localhost:3000 in browser
  2. Enable voice mode + grant mic permission
  3. Say "hey jarvis, [command]"
  4. Wait for JARVIS to respond fully
  5. Wait MORE THAN 5 seconds in silence
  6. Say something WITHOUT a wake phrase
  7. JARVIS picks it up as command (BUG)
started: Long-standing — 14+ prior fix attempts. Most recent: 06ff7ab (window only opens after voice turns), 84e57a5 (Phase 10-04 turnIsVoiceRef refactor).

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-05-30T16:00:00Z
  checked: Initial file read — JarvisListener.tsx, wake-word.ts, mic-state.ts, JarvisConsole.tsx (200-540), GlobalJarvisHandler.tsx (90-200), Phase 10-04 SUMMARY
  found: The flow on Whisper-keyword fallback path (no PICOVOICE key, hasPorcupineWakeWord=false):
    1. micState="listening" + onSpeechStart fires
    2. inFollowUp = followUpUntilRef.current > Date.now()
    3a. IF inFollowUp: activationSourceRef="follow-up", dispatch SPEECH_START → recording, wake-burst event
    3b. ELSE: activationSourceRef="wake-word" (stays in listening)
    4. onSpeechEnd fires → source captured, activationSourceRef cleared
    5. STT runs (UNCONDITIONALLY — note line 425+ has no gate on source)
    6. For passive-listen (s==='listening' && source==='wake-word'): stripWakeWord required
    7. For follow-up (source==='follow-up'): NO wake check — command = transcript verbatim
  implication: Critical observation — on the passive-listen branch (source="wake-word"), the ONLY thing stopping ambient speech from becoming a command is stripWakeWord returning non-null. If Whisper hallucinates "hey jarvis" at the start of an ambient utterance, the user's ambient speech becomes a command. This matches H1.

- timestamp: 2026-05-30T16:00:00Z
  checked: handleSentence's onEnd closure (line 718-727)
  found: followUpUntilRef.current = Date.now() + FOLLOW_UP_MS ONLY fires when turnIsVoiceRef.current === true. turnIsVoiceRef is set on line 663 from detail.isVoice === true. detail.isVoice comes from JarvisConsole (line 325: isVoice: turnIsVoice = opts?.isVoice === true) or GlobalJarvisHandler (line 110: isVoice: true hardcoded).
  implication: A VOICE turn correctly opens the window. A TYPED turn does NOT open the window. The 06ff7ab fix is in place. However, this does NOT address H2: every voice turn extends the window by 5s, so the user could be in a sustained-conversation loop where the window keeps re-opening.

- timestamp: 2026-05-30T16:00:00Z
  checked: handleEndOfTurn (line 743-770)
  found: Same logic — if turnIsVoiceRef.current is true, window opens. Silent-branch (silentCycledRef.current) also opens window. ElevenLabs path falls through to ttsPlayer.endOfTurn() which calls the onEnd in handleSentence (which is where the window-open is).
  implication: Two places open the window: handleSentence's onEnd (audible TTS path) and handleEndOfTurn (silent path). Both are gated on turnIsVoiceRef.

- timestamp: 2026-05-30T16:00:00Z
  checked: VAD config (line 316-378) — startOnLoad=true, runs continuously
  found: VAD fires onSpeechStart/onSpeechEnd on EVERY detected speech segment. The gate on whether to process speech is purely in micStateRef + activationSourceRef.
  implication: Continuous VAD means ambient noise generates onSpeechStart events constantly. If the FSM lands in a state where onSpeechStart sets activationSourceRef="wake-word", then onSpeechEnd ALWAYS runs STT on Groq. The user is consuming Groq STT credits on every ambient noise burst, and the wake-word stripping is the only line of defense.

- timestamp: 2026-05-30T16:25:00Z
  checked: User reproduction trace pasted (see checkpoint response) — instrumented build from commit 753a17a captured the full lifecycle of a failing turn
  found: Trace shows:
    - T=271960: handleSentence onEnd opens window, newExpiry=276960 (correct)
    - T=277762: onSpeechStart entry — s=listening, deltaMs=-802 (window already expired), inFollowUp=false → branch=passive-listen, source="wake-word" ✓
    - T=277762: VAD detected real speech start
    - Between 277762 and 300801: clap detector fires → activationSource overwritten "wake-word" → "clap", DOUBLE_CLAP dispatched (no log because dispatch lacks an instrument)
    - T=300801: onSpeechEnd entry — s="recording" (!), activationSource="clap" (!), deltaMs=-23841 (24s past window expiry)
    - T=300801: STT result transcript=" I'm testing if you will start up. I'm testing it." — isPassiveListen=false, isFollowUp=false, isPorcupineWake=false, source="clap" → falls through to default press-to-talk branch → command = transcript verbatim → DISPATCHED
  implication: The follow-up window logic is correct. The wake-word stripping logic is correct. The bug is the clap detector firing on plosive consonants ('t' in "testing", "if", "start") during normal speech — bypassing every gate in the system.

- timestamp: 2026-05-30T16:25:00Z
  checked: use-clap-detector.ts hook signature
  found: Hook accepts onDoubleClap callback; the worklet port's message handler invokes callbackRef.current() directly when it receives `{type: 'double-clap'}`. The 250-650ms inter-clap window lives in the worklet processor itself.
  implication: The cleanest gate point is the JarvisListener-supplied onDoubleClap callback (early-return on vadSpeakingRef.current). No changes to use-clap-detector.ts needed — keeps the fix surgical.

## Resolution

root_cause: AudioWorklet clap detector fires on plosive consonants ('t', 'p', 'k') in normal speech. The two-clap inter-window (250-650ms) is naturally satisfied by adjacent plosives in a typical utterance, producing a spurious DOUBLE_CLAP mid-speech. This overwrites activationSource from "wake-word" → "clap" and forces FSM listening → recording, causing onSpeechEnd to fall through to the default branch (no wake-word gate) and dispatch any post-window transcript as a command. Follow-up window logic itself is correct — the clap detector was bypassing it.
fix: VAD-gated clap suppression. Track VAD speech state in vadSpeakingRef (true between onSpeechStart and onSpeechEnd). In the onDoubleClap callback supplied to useClapDetector, early-return when vadSpeakingRef.current === true. Claps are silence-gated by nature — if VAD is currently detecting speech, the "clap" is a plosive, not a clap.
verification: Self-verified via static review of diff f5464e5: (1) vadSpeakingRef declared with useRef(false); (2) set true at onSpeechStart entry BEFORE any branching; (3) cleared at onSpeechEnd top, after vadEndAt capture, before any early-return path; (4) onDoubleClap early-returns with warn log when vadSpeakingRef.current===true. Awaiting user runtime verification — reproduce wake-command → 6s silence → ambient speech and confirm: (a) [clap] suppressed warnings appear if plosives were the cause, (b) source="wake-word" at onSpeechEnd entry, (c) stripWakeWord returns null → silent discard, (d) no command dispatched.
files_changed: [apps/web/components/voice/JarvisListener.tsx]

## Final Summary

**Outcome:** Resolved 2026-05-30. User confirmed fix works in browser — ambient speech after the 5s follow-up window is now silently discarded (no command dispatch, no STT-credit burn on plosive consonants).

**Root cause (one line):** AudioWorklet clap detector fired on plosive consonants ('t', 'p', 'k') during normal speech, producing spurious DOUBLE_CLAP events that overrode `activationSource` ("wake-word" → "clap") and forced FSM `listening` → `recording`, causing onSpeechEnd to fall through to the default press-to-talk branch (no wake-word gate) and dispatch any post-window transcript as a command.

**Fix mechanism:** VAD-gated clap suppression. `vadSpeakingRef` tracks VAD speech state — set true at onSpeechStart entry, cleared at onSpeechEnd top. The `onDoubleClap` callback supplied to `useClapDetector` early-returns when `vadSpeakingRef.current === true`. Claps are silence-gated by nature — if VAD is currently detecting speech, the "clap" is a plosive.

**Commit chain:**
- `753a17a` — instrumentation (`[DEBUG-LEAK]` logs across JarvisListener + wake-word.ts)
- `f5464e5` — fix (VAD-gated clap suppression in JarvisListener.tsx)
- `55a3349` — strip diagnostics after user-confirmed fix
- (resolution-doc commit follows)

**Lessons:**
1. Single-channel telemetry (only `[wake-path]` logs) wasn't enough — the bug bypassed the channel being instrumented. Trace EVERY input to the FSM (clap detector ref-overrides, VAD events, follow-up timer), not just the "expected" path.
2. AudioWorklet plosive false-positives are a known voice-UI hazard. Future audio-gesture detectors (snap, whistle, etc.) should be VAD-gated by default — assume mic input contains speech unless proven otherwise.
3. The 14 prior fix attempts focused on the follow-up timer logic; the timer was always correct. Whenever a long-standing bug resists multiple targeted fixes, widen the suspect surface to upstream signal sources (here: AudioWorklet → ref override) before re-investigating the previously-tested logic.
