// apps/desktop/src/flowpill/audio/index.ts
// Public surface of the flowpill capture path. The pill controller should
// import from here and from nowhere deeper.
//
// Typical use:
//
//   const armed = await armPreroll();            // on raw Option key down
//   const cap = await startCapture("hold");      // once the gesture is known
//   const off = cap.onLevel((l) => pill.setLevel(l));
//   const outcome = await cap.stop();            // on Option release
//   off();
//   if (outcome.kind === "transcript") postToJarvis(outcome.text);
//
// Every other outcome kind (`empty`, `cancelled`, `mic-denied`, `stt-failed`)
// means nothing should be posted, and each is distinct so the pill can say
// something honest about why.

export {
  activeCapture,
  armPreroll,
  disarmPreroll,
  isFlowpillCaptureActive,
  resetFlowpillAudio,
  startCapture,
  type CaptureHandle,
  type CaptureOptions,
} from "./capture";

export { LevelMeter, computeRms, normalizeLevel } from "./level";
export { PrerollBuffer } from "./preroll";
export { SilenceWatcher, bufferHasSpeech, type SilenceWatcherParams } from "./silence";
export { createTauriPcmSource, MicBusyError } from "./source";
export {
  transcribeUtterance,
  type FetchLike,
  type TranscribeDeps,
  type TranscriptionResult,
} from "./transcribe";
export {
  FLOWPILL_AUDIO_DEFAULTS,
  resolveConfig,
  type CaptureMode,
  type CaptureOutcome,
  type EmptyReason,
  type FlowpillAudioConfig,
  type PcmChunk,
  type PcmSource,
} from "./types";
