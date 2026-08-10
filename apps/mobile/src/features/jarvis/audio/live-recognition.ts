// Live dictation via expo-speech-recognition (iOS SFSpeechRecognizer):
// interim transcripts stream to the UI while speaking, and the audio is
// persisted to a 16kHz int16 WAV that we upload to the server's Whisper
// pipeline (which remains the canonical transcript).
//
// The native module is NOT present in Expo Go or in app binaries built
// before v1.1.0 — everything here degrades gracefully to null so callers
// fall back to the plain expo-audio recorder (no live transcript).

import { Paths } from "expo-file-system";

type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;

let cached: SpeechModule | null | undefined;

function getModule(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule: SpeechModule;
    };
    // Touch a method — requireNativeModule throws lazily on some setups.
    mod.ExpoSpeechRecognitionModule.getStateAsync;
    cached = mod.ExpoSpeechRecognitionModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function liveRecognitionAvailable(): boolean {
  return getModule() !== null;
}

export interface LiveSession {
  /** Stop listening and resolve the persisted WAV uri (null if none). */
  stop: () => Promise<string | null>;
  /** Abort without keeping anything. */
  cancel: () => void;
}

/**
 * Start live dictation. `onPartial` fires with the running transcript
 * (interim + final segments concatenated). Returns null when the native
 * module is unavailable or permissions are denied.
 */
export async function startLiveRecognition(
  onPartial: (transcript: string) => void,
): Promise<LiveSession | null> {
  const speech = getModule();
  if (!speech) return null;

  try {
    const perms = await speech.requestPermissionsAsync();
    if (!perms.granted) return null;
  } catch {
    return null;
  }

  let finalSoFar = "";
  let audioUri: string | null = null;
  let resolveAudioEnd: ((uri: string | null) => void) | null = null;

  const subs = [
    speech.addListener("result", (event) => {
      const text = event.results[0]?.transcript ?? "";
      if (event.isFinal) {
        finalSoFar = `${finalSoFar}${finalSoFar ? " " : ""}${text}`.trim();
        onPartial(finalSoFar);
      } else {
        onPartial(`${finalSoFar}${finalSoFar ? " " : ""}${text}`.trim());
      }
    }),
    speech.addListener("audioend", (event) => {
      audioUri = event.uri ?? null;
      resolveAudioEnd?.(audioUri);
    }),
    speech.addListener("error", (event) => {
      // "aborted"/"no-speech" are expected lifecycle noise; anything else
      // ends the session so the caller's WAV-upload fallback still runs.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.warn("[live-stt]", event.error, event.message);
      }
      resolveAudioEnd?.(audioUri);
    }),
  ];

  const cleanup = () => {
    for (const s of subs) s.remove();
  };

  try {
    speech.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
      iosTaskHint: "dictation",
      recordingOptions: {
        persist: true,
        outputDirectory: Paths.cache.uri,
        outputSampleRate: 16000,
        outputEncoding: "pcmFormatInt16",
      },
    });
  } catch (err) {
    console.warn("[live-stt] start failed", err);
    cleanup();
    return null;
  }

  return {
    stop: () =>
      new Promise<string | null>((resolve) => {
        if (audioUri) {
          cleanup();
          resolve(audioUri);
          return;
        }
        resolveAudioEnd = (uri) => {
          cleanup();
          resolve(uri);
        };
        // Belt-and-braces: never hang the send path on a missing audioend.
        setTimeout(() => {
          cleanup();
          resolve(audioUri);
        }, 4000);
        try {
          speech.stop();
        } catch {
          cleanup();
          resolve(null);
        }
      }),
    cancel: () => {
      cleanup();
      try {
        speech.abort();
      } catch {
        // already stopped
      }
    },
  };
}
