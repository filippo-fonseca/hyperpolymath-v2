# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## jarvis-follow-up-window-leak — Clap detector fires on plosive consonants, bypasses follow-up window gate
- **Date:** 2026-05-30
- **Error patterns:** follow-up window, voice command, ambient speech, jarvis, clap detector, plosive, AudioWorklet, activationSource, wake-word, passive-listen, VAD, stripWakeWord, listening, recording
- **Root cause:** AudioWorklet clap detector fires on plosive consonants ('t', 'p', 'k') in normal speech. The 250-650ms inter-clap window is naturally satisfied by adjacent plosives in a typical utterance, producing a spurious DOUBLE_CLAP mid-speech. This overrode activationSource ("wake-word" → "clap") and forced FSM listening → recording, causing onSpeechEnd to fall through to the default press-to-talk branch (no wake-word gate) and dispatch any post-window transcript as a command.
- **Fix:** VAD-gated clap suppression. vadSpeakingRef tracks VAD speech state (true between onSpeechStart and onSpeechEnd). The onDoubleClap callback supplied to useClapDetector early-returns when vadSpeakingRef.current === true. Claps are silence-gated by nature — if VAD is currently detecting speech, the "clap" is a plosive.
- **Files changed:** apps/web/components/voice/JarvisListener.tsx
---
