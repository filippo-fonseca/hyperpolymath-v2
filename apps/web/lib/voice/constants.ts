/**
 * Phase 7 — Voice layer shared constants.
 *
 * Plan 07-01 owns this file (API routes + deps layer).
 * Plan 07-02 imports from it (Settings UI + hook).
 * Plan 07-03 (JarvisListener) imports AUDIO_CONSTRAINTS, VOICE_SETTINGS_KEY.
 * Plan 07-04 (personality + TTS wiring) imports DEFAULT_VOICE_ID, voiceId sources.
 */

import type { VoiceSettings } from "./types";

/** ElevenLabs voice ID: George — warm, articulate British male. */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/** Default wake-word phrase (pre-trained; custom phrases require Picovoice Console). */
export const DEFAULT_WAKE_WORD = "Hey Jarvis";

/** localStorage key for persisted voice settings. */
export const VOICE_SETTINGS_KEY = "jarvis-voice-settings";

/** localStorage key for the one-shot welcome greeting flag (D-03). */
export const WELCOME_HEARD_KEY = "jarvis-voice-welcome-heard";

/** One-shot welcome greeting played when the user first enables voice. */
export const WELCOME_GREETING = "Hello, sir.";

/**
 * Audio constraints for getUserMedia.
 * VOICE-12 mandates all three flags.
 */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/** Hard buffer cap per Groq 25MB limit (Pitfall 8) — 45s @ 16kHz mono PCM ~= 1.4MB. */
export const MAX_UTTERANCE_MS = 45_000;

/** AudioWorklet module path — must match the static asset location. */
export const CLAP_WORKLET_URL = "/worklets/clap-detector.js";
export const CLAP_PROCESSOR_NAME = "clap-detector-processor";

/** Self-hosted Silero VAD model path (Pitfall 4). */
export const VAD_MODEL_URL = "/voice/vad.onnx";

/** Default state for useVoiceSettings on first mount (no localStorage). */
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceEnabled: false,
  discreetMode: false,
  wakeWordPhrase: DEFAULT_WAKE_WORD,
  clapEnabled: true,
  ttsProvider: "elevenlabs",
  voiceId: DEFAULT_VOICE_ID,
  micDeviceId: null,
  hasHeardWelcome: false,
};
