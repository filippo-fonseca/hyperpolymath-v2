// Voice capture: tap-to-record / tap-to-stop, 16kHz mono 16-bit WAV — the
// same format the desktop app uploads to /api/jarvis/voice/transcript
// (apps/desktop/src/audio/encode-wav.ts). iOS AVAudioRecorder writes a real
// RIFF/WAVE container when given LINEARPCM + a .wav extension.

import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { useCallback, useRef, useState } from "react";

// Mirror the desktop capture format (16kHz mono 16-bit LE PCM).
const WAV_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

// Match desktop's hard cap (Groq 25MB limit; 45s @ 16kHz mono ≈ 1.4MB).
export const MAX_UTTERANCE_MS = 45_000;

export interface CaptureResult {
  wav: Uint8Array<ArrayBuffer>;
  vadEndAt: number;
}

export function useVoiceRecorder(): {
  recorder: AudioRecorder;
  isRecording: boolean;
  start: () => Promise<boolean>;
  stop: () => Promise<CaptureResult | null>;
  cancel: () => Promise<void>;
} {
  const recorder = useAudioRecorder(WAV_RECORDING_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return false;

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);

    // Belt-and-braces stop at the utterance cap; the UI's stop() still owns
    // the upload, this just halts capture.
    maxTimer.current = setTimeout(() => {
      void recorder.stop();
    }, MAX_UTTERANCE_MS);

    return true;
  }, [recorder]);

  const stop = useCallback(async (): Promise<CaptureResult | null> => {
    if (maxTimer.current) {
      clearTimeout(maxTimer.current);
      maxTimer.current = null;
    }
    setIsRecording(false);

    const vadEndAt = Date.now();
    try {
      await recorder.stop();
    } catch {
      // already stopped by the cap timer
    }

    // Restore playback-friendly audio mode (speaker, not earpiece).
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    const uri = recorder.uri;
    if (!uri) return null;

    try {
      const wav = await new File(uri).bytes();
      if (!wav.byteLength) return null;
      return { wav, vadEndAt };
    } catch (err) {
      console.warn("[recorder] failed to read capture file", err);
      return null;
    }
  }, [recorder]);

  /** Discard the in-flight recording without uploading anything. */
  const cancel = useCallback(async (): Promise<void> => {
    if (maxTimer.current) {
      clearTimeout(maxTimer.current);
      maxTimer.current = null;
    }
    setIsRecording(false);
    try {
      await recorder.stop();
    } catch {
      // not recording
    }
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
  }, [recorder]);

  return { recorder, isRecording, start, stop, cancel };
}
