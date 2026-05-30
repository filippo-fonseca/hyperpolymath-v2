---
status: investigating
trigger: "JARVIS follow-up window does not close after 5 seconds — voice picks up arbitrary speech indefinitely on the Whisper-keyword fallback path."
created: 2026-05-30T16:00:00Z
updated: 2026-05-30T16:00:00Z
---

## Current Focus

hypothesis: Need empirical evidence — three candidates ranked by orchestrator (H1 Whisper hallucination, H2 follow-up window self-extending, H3 FSM stuck in recording with null source). All three could compound.
test: Adding strategic console.log instrumentation at all decision points in JarvisListener.tsx + wake-word.ts, then asking user to reproduce and paste console output.
expecting: Console trace will reveal which branch fires after the 5s window should have closed — whether stripWakeWord returns non-null on hallucinated transcript (H1), or followUpUntilRef gets extended (H2), or activationSourceRef is null but STT still fires command (H3), or something unseen.
next_action: Add 7 console.log statements (onSpeechStart entry/source, onSpeechEnd entry/STT-result/wake-strip, handleSentence/handleEndOfTurn), commit as temporary diagnostic, hand off to user for reproduction.

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

## Resolution

root_cause: (TBD — need empirical confirmation from console output)
fix: (pending)
verification: (pending)
files_changed: []
