// apps/desktop/src/flowpill/audio/types.ts
// Shared types and tunables for the flowpill capture path.
//
// The flowpill is INPUT ONLY. Nothing in this directory plays audio, speaks, or
// renders a JARVIS response; it turns "the microphone is open" into "here is the
// finished transcript string" and stops there.

/**
 * How the caller intends to end the utterance. The buffer behaves identically
 * either way (buffer everything, transcribe once at the end); the distinction is
 * carried through purely so the pill UI and the controller can label the session
 * and so logs are readable.
 *
 *  - `hold`   push-to-talk. The caller stops on Option key release.
 *  - `locked` hands-free. The caller stops on the next Option tap.
 */
export type CaptureMode = "hold" | "locked";

/** Why a session produced no usable text. */
export type EmptyReason =
  /** The buffer never crossed the speech-energy threshold. Never sent to STT. */
  | "silence"
  /** STT ran and came back with an empty or whitespace-only transcript. */
  | "blank-transcript";

/**
 * The single, exhaustive outcome of a capture session. Every failure mode the
 * caller must act on is a value here: nothing in this module throws at the
 * caller, and nothing fails silently.
 */
export type CaptureOutcome =
  /** Success. `text` is non-empty and already trimmed. */
  | { kind: "transcript"; text: string; durationMs: number }
  /** Nothing worth sending. The caller must NOT post an empty message. */
  | { kind: "empty"; reason: EmptyReason; durationMs: number }
  /** The user cancelled (Escape). Audio discarded, nothing sent. */
  | { kind: "cancelled" }
  /** The microphone never produced audio. Usually a denied/revoked permission. */
  | { kind: "mic-denied"; message: string }
  /** The transcript request failed. `status` is present for an HTTP failure. */
  | { kind: "stt-failed"; message: string; status?: number };

/** One chunk of mono PCM as delivered by the capture source. */
export interface PcmChunk {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * A microphone that yields mono PCM. Abstracted so the orchestrator is testable
 * headlessly with a synthetic fixture, and so a future Rust `cpal` variant or a
 * webview `getUserMedia` variant can be swapped in without touching the session
 * logic.
 *
 * `start` resolves once the underlying device has been asked to open. It does
 * NOT guarantee that audio will arrive; a denied microphone on macOS opens
 * without error and simply never delivers frames, which is why the session runs
 * its own no-frames watchdog.
 */
export interface PcmSource {
  start(onChunk: (chunk: PcmChunk) => void): Promise<void>;
  stop(): Promise<void>;
}

/** Tunables. Every one has a conservative default; callers override piecemeal. */
export interface FlowpillAudioConfig {
  /** Target sample rate of the capture source. The Rust cpal path resamples to this. */
  sampleRate: number;
  /** Length of the rolling pre-roll kept before the caller says start. */
  prerollMs: number;
  /** RMS below this counts as silence. Matches the HUD VAD threshold. */
  rmsThreshold: number;
  /**
   * Continuous silence at or beyond this many milliseconds raises the
   * silence hint. Deliberately long: this module never ends an utterance on its
   * own, it only tells the caller that the user has gone quiet.
   */
  silenceHintMs: number;
  /** Window used to compute one level sample. 320 @ 16 kHz gives 50 Hz. */
  levelWindowSamples: number;
  /** Linear gain applied to RMS before clamping to 0..1 for the waveform. */
  levelGain: number;
  /**
   * If the source has been open this long and not one frame has arrived, treat
   * the microphone as denied rather than hanging forever (tauri#8979).
   */
  micOpenTimeoutMs: number;
  /** An armed-but-unused pre-roll releases the microphone after this long. */
  prerollIdleTimeoutMs: number;
  /** Hard ceiling on one utterance. Locked mode can otherwise run away. */
  maxUtteranceMs: number;
}

export const FLOWPILL_AUDIO_DEFAULTS: FlowpillAudioConfig = {
  sampleRate: 16_000,
  // 400ms sits in the middle of the 300-500ms band. Without a pre-roll the
  // first syllable of a push-to-talk utterance is clipped, which is the single
  // most common complaint about this interaction.
  prerollMs: 400,
  // Same threshold the shipping HUD VAD uses, so "is this silence?" means the
  // same thing on both paths.
  rmsThreshold: 0.01,
  silenceHintMs: 2_500,
  levelWindowSamples: 320,
  // Speech RMS typically sits around 0.02 to 0.15, so a gain of 8 puts ordinary
  // speech near full scale. Mirrors the HUD orb's scaling.
  levelGain: 8,
  micOpenTimeoutMs: 1_500,
  prerollIdleTimeoutMs: 10_000,
  maxUtteranceMs: 120_000,
};

export function resolveConfig(
  overrides?: Partial<FlowpillAudioConfig>,
): FlowpillAudioConfig {
  return { ...FLOWPILL_AUDIO_DEFAULTS, ...(overrides ?? {}) };
}
