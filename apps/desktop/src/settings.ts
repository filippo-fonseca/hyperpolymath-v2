// apps/desktop/src/settings.ts
// Persistent settings backed by @tauri-apps/plugin-store.
// All toggles are live-apply — changes take effect immediately without restart.
//
// Store keys (contract with index.html UI):
//   tts.enabled             boolean  — whether TTS speaks responses (default true)
//   tts.voiceId             string   — ElevenLabs voice ID (default George)
//   tts.provider            string   — "elevenlabs" | "off" (default "elevenlabs")
//   physicalExtender.enabled boolean — whether to respond to SSE trigger events (default true)

import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "jarvis-desktop-settings.json";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export interface DesktopSettings {
  ttsEnabled: boolean;
  ttsVoiceId: string;
  ttsProvider: "elevenlabs" | "off";
  physicalExtenderEnabled: boolean;
  /** Milliseconds of continuous silence before VAD declares end-of-turn. */
  vadSilenceMs: number;
  /** When true, every capture turn starts in extend mode — VAD silence + hard cap
   *  are suppressed. Only the manual-mode toggle OR the ⌘⌃E shortcut can close the mic. */
  manualMode: boolean;
}

const DEFAULTS: DesktopSettings = {
  ttsEnabled: true,
  ttsVoiceId: DEFAULT_VOICE_ID,
  ttsProvider: "elevenlabs",
  physicalExtenderEnabled: true,
  vadSilenceMs: 1_500,
  manualMode: false,
};

let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load(STORE_FILE, {
      autoSave: true,
      defaults: {
        "tts.enabled": DEFAULTS.ttsEnabled,
        "tts.voiceId": DEFAULTS.ttsVoiceId,
        "tts.provider": DEFAULTS.ttsProvider,
        "physicalExtender.enabled": DEFAULTS.physicalExtenderEnabled,
        "vad.silenceMs": DEFAULTS.vadSilenceMs,
        "capture.manualMode": DEFAULTS.manualMode,
      },
    });
  }
  return _store;
}

/** Load all settings from the persistent store. Returns defaults for unset keys. */
export async function loadSettings(): Promise<DesktopSettings> {
  const store = await getStore();

  const ttsEnabled = await store.get<boolean>("tts.enabled");
  const ttsVoiceId = await store.get<string>("tts.voiceId");
  const ttsProvider = await store.get<"elevenlabs" | "off">("tts.provider");
  const physicalExtenderEnabled = await store.get<boolean>("physicalExtender.enabled");
  const vadSilenceMs = await store.get<number>("vad.silenceMs");
  const manualMode = await store.get<boolean>("capture.manualMode");

  return {
    ttsEnabled: ttsEnabled ?? DEFAULTS.ttsEnabled,
    ttsVoiceId: ttsVoiceId ?? DEFAULTS.ttsVoiceId,
    ttsProvider: ttsProvider ?? DEFAULTS.ttsProvider,
    physicalExtenderEnabled: physicalExtenderEnabled ?? DEFAULTS.physicalExtenderEnabled,
    vadSilenceMs: vadSilenceMs ?? DEFAULTS.vadSilenceMs,
    manualMode: manualMode ?? DEFAULTS.manualMode,
  };
}

/** Persist a single setting by key. */
export async function saveSetting<K extends keyof DesktopSettings>(
  key: K,
  value: DesktopSettings[K],
): Promise<void> {
  const store = await getStore();
  // Map camelCase keys to dot-notation store keys
  const storeKey =
    key === "ttsEnabled" ? "tts.enabled"
    : key === "ttsVoiceId" ? "tts.voiceId"
    : key === "ttsProvider" ? "tts.provider"
    : key === "physicalExtenderEnabled" ? "physicalExtender.enabled"
    : key === "vadSilenceMs" ? "vad.silenceMs"
    : "capture.manualMode";
  await store.set(storeKey, value);
}
