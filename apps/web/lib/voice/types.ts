/**
 * Phase 7 — Voice layer shared types.
 *
 * Canonical source of truth for all voice-related TypeScript shapes.
 * Consumed by: use-voice-settings, JarvisListener, TTS queue, STT proxy.
 *
 * Plan 07-01 owns this file (API routes + deps layer).
 * Plan 07-02 imports from it (Settings UI + hook).
 */

/** Five-state FSM for the mic pipeline indicator dot. */
export type MicState =
  | "idle"
  | "listening"
  | "recording"
  | "thinking"
  | "speaking";

/** Persisted settings for the voice layer (localStorage key: jarvis-voice-settings). */
export interface VoiceSettings {
  /** Whether voice mode is enabled at all. */
  voiceEnabled: boolean;
  /** Silences TTS + disables wake-word; text Console still works. */
  discreetMode: boolean;
  /** Custom wake-word phrase (only "Hey Jarvis" ships pre-trained). */
  wakeWordPhrase: string;
  /** Clap-clap activation toggle. */
  clapEnabled: boolean;
  /** TTS provider selection. */
  ttsProvider: "elevenlabs" | "browser" | "off";
  /** ElevenLabs voice ID for TTS output. */
  voiceId: string;
  /** Persisted mic deviceId from enumerateDevices(); null = browser default. */
  micDeviceId: string | null;
  /** Set to true after the first-enable welcome greeting plays. */
  hasHeardWelcome: boolean;
}

/** Request body for POST /api/jarvis/tts */
export interface TtsRequest {
  text: string;
  voiceId?: string;
}

/** Response shape from POST /api/jarvis/stt */
export interface SttResponse {
  transcript: string;
}
