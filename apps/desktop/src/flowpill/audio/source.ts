// apps/desktop/src/flowpill/audio/source.ts
// The microphone the flowpill records from.
//
// It is the native cpal stream the app already ships (`start_capture` /
// `stop_capture`, emitting `audio-chunk` as 16 kHz mono Float32), NOT the
// webview's getUserMedia. Two reasons:
//
//  1. The pill window is non-activating and always-on-top. A WKWebView that
//     never takes focus is a poor place to hold a getUserMedia stream, and
//     Tauri does not reliably persist the webview microphone grant across
//     restarts (tauri#8979). The native stream has neither problem.
//  2. The Rust side already downmixes to mono and resamples to 16 kHz, which is
//     exactly the format the transcript route wants.
//
// This file only READS the existing capture surface. It adds no Tauri command
// and changes nothing about the HUD's use of the same stream.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { isCaptureActive } from "@/audio/capture";

import { FLOWPILL_AUDIO_DEFAULTS, type PcmChunk, type PcmSource } from "./types";

interface AudioChunkPayload {
  samples: number[];
  sample_rate: number;
}

/** Raised when the HUD already owns the single cpal stream. */
export class MicBusyError extends Error {
  constructor() {
    super("the microphone is already in use by an active JARVIS turn");
    this.name = "MicBusyError";
  }
}

/**
 * The native cpal source. There is exactly one cpal stream in the process, so
 * this refuses to open while the HUD's capture path owns it rather than starting
 * a tug of war where either side's `stop_capture` kills the other's recording.
 */
export function createTauriPcmSource(): PcmSource {
  let unlisten: UnlistenFn | null = null;

  return {
    async start(onChunk: (chunk: PcmChunk) => void): Promise<void> {
      if (isCaptureActive()) throw new MicBusyError();
      unlisten = await listen<AudioChunkPayload>("audio-chunk", (event) => {
        const samples = new Float32Array(event.payload.samples);
        if (samples.length === 0) return;
        onChunk({
          samples,
          sampleRate: event.payload.sample_rate || FLOWPILL_AUDIO_DEFAULTS.sampleRate,
        });
      });
      try {
        await invoke("start_capture");
      } catch (err) {
        unlisten();
        unlisten = null;
        throw err;
      }
    },

    async stop(): Promise<void> {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      await invoke("stop_capture");
    },
  };
}
