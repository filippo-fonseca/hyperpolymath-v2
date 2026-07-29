// apps/desktop/src/settings.ts
// Persistent settings backed by @tauri-apps/plugin-store.
// All toggles are live-apply — changes take effect immediately without restart.
//
// Store keys (contract with index.html UI):
//   tts.enabled             boolean  — whether TTS speaks responses (default true)
//   tts.voiceId             string   — ElevenLabs voice ID (default George)
//   tts.provider            string   — "elevenlabs" | "off" (default "elevenlabs")
//   physicalExtender.enabled boolean — whether to respond to SSE trigger events (default true)
//   wake.enabled            boolean  — idle wake-phrase listener (OPT-IN, default false)
//   wake.enabledExplicit    boolean  — marker: wake.enabled was set by the user (see below)
//   startup.briefingEnabled boolean  — spoken briefing on session-start (OPT-IN, default false)
//   startup.openOnStart     array    — apps/URLs opened on session-start (default [])
//   startup.shortcuts       array    — macOS Shortcuts run on session-start (default [])
//   audio.inputDevice       string|null — chosen microphone NAME, or null to follow
//                                      the macOS default. NOT read or written here:
//                                      src-tauri/src/audio.rs owns this key so the
//                                      device can be resolved at stream-open time
//                                      from whichever webview is recording. The UI
//                                      goes through src/audio/input-devices.ts.

import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "jarvis-desktop-settings.json";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/**
 * One item in the startup openOnStart list (step 2 of the session-start
 * sequence). `{ type: "url", value: "https://mail.google.com" }` opens in the
 * default browser; `{ type: "app", value: "Spotify" }` launches the app by
 * name via `open -a`. Items are launched in parallel after the briefing
 * drains.
 */
export interface StartupOpenItem {
  type: "url" | "app";
  value: string;
}

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
  /** When true, an always-on idle mic loop listens for the "daddy's home" wake
   *  phrase and invokes JARVIS (wake/wake-probe.ts). OPT-IN: default false.
   *  The mic stays closed at rest unless the user explicitly enables wake mode
   *  in settings, because wake mode keeps the macOS green mic indicator on
   *  continuously. */
  wakeEnabled: boolean;

  // ── Startup sequence (session-start) ──────────────────────────────────────
  // On the FIRST invoke of an app session (hotkey / tray / wake), the desktop
  // runs the configurable startup sequence (startup/sequencer.ts):
  //   1. spoken briefing (if startupBriefingEnabled) — TTS fully drains first
  //   2. startupOpenOnStart items opened in PARALLEL
  //   3. startupShortcuts run in PARALLEL (concurrent with step 2)
  //   4. mic opens for the first utterance
  // Later invokes in the same session skip 1-3 and go straight to the mic.
  // Store keys: startup.briefingEnabled / startup.openOnStart /
  // startup.shortcuts. Read via loadSettings(); write via
  // saveSetting("startupBriefingEnabled" | "startupOpenOnStart" |
  // "startupShortcuts", value). Malformed persisted entries are dropped on
  // load, so consumers always see well-shaped values.

  /** Speak the proactive briefing on session-start. OPT-IN: default false — a
   *  greeting the user never asked for reads as the app talking to itself,
   *  so waking/talking starts with a clean transcript unless the user turns
   *  this on explicitly in settings. */
  startupBriefingEnabled: boolean;
  /** Apps/URLs to open on session-start, launched in parallel. Default []. */
  startupOpenOnStart: StartupOpenItem[];
  /** macOS Shortcuts names to run on session-start, in parallel. Default []. */
  startupShortcuts: string[];

  /** Base URL of the local lharries/whatsapp-mcp Go bridge — the desktop POSTs
   *  to `<url>/api/send` when send_message action.app === 'whatsapp'. Default
   *  http://localhost:8080 (the bridge's default). Change if you run the
   *  bridge on a non-default port. */
  whatsappBridgeUrl: string;
}

/** The baked-in defaults. Exported so a surface that cannot reach the tauri
 *  store (the widget debug stage, tests) can still render real values instead
 *  of blanks. Treat as read-only. */
export const DEFAULT_SETTINGS: DesktopSettings = {
  ttsEnabled: true,
  ttsVoiceId: DEFAULT_VOICE_ID,
  ttsProvider: "elevenlabs",
  physicalExtenderEnabled: true,
  vadSilenceMs: 1_500,
  manualMode: false,
  wakeEnabled: false,
  startupBriefingEnabled: false,
  startupOpenOnStart: [],
  startupShortcuts: [],
  whatsappBridgeUrl: "http://localhost:8080",
};

/** camelCase settings key → dot-notation plugin-store key. */
const STORE_KEYS: Record<keyof DesktopSettings, string> = {
  ttsEnabled: "tts.enabled",
  ttsVoiceId: "tts.voiceId",
  ttsProvider: "tts.provider",
  physicalExtenderEnabled: "physicalExtender.enabled",
  vadSilenceMs: "vad.silenceMs",
  manualMode: "capture.manualMode",
  wakeEnabled: "wake.enabled",
  startupBriefingEnabled: "startup.briefingEnabled",
  startupOpenOnStart: "startup.openOnStart",
  startupShortcuts: "startup.shortcuts",
  whatsappBridgeUrl: "whatsapp.bridgeUrl",
};

// `wake.enabled` is only trusted when this marker is present. The plugin-store
// autoSave bakes the whole defaults map into the settings JSON on the first
// write of ANY key, so an existing install can carry `wake.enabled: true`
// (the OLD default) without the user ever having touched a toggle. That baked
// value is indistinguishable from an explicit choice. Wake is now opt-in, so:
// the marker is written whenever saveSetting("wakeEnabled", …) runs (i.e. the
// user actually flipped the toggle); without the marker, loadSettings returns
// the opt-in default (false) regardless of any persisted `wake.enabled`.
// Net effect: untouched installs get wake OFF; choices made via the settings
// toggle are persisted and respected from then on.
const WAKE_EXPLICIT_KEY = "wake.enabledExplicit";

let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load(STORE_FILE, {
      autoSave: true,
      defaults: {
        "tts.enabled": DEFAULT_SETTINGS.ttsEnabled,
        "tts.voiceId": DEFAULT_SETTINGS.ttsVoiceId,
        "tts.provider": DEFAULT_SETTINGS.ttsProvider,
        "physicalExtender.enabled": DEFAULT_SETTINGS.physicalExtenderEnabled,
        "vad.silenceMs": DEFAULT_SETTINGS.vadSilenceMs,
        "capture.manualMode": DEFAULT_SETTINGS.manualMode,
        "wake.enabled": DEFAULT_SETTINGS.wakeEnabled,
        "startup.briefingEnabled": DEFAULT_SETTINGS.startupBriefingEnabled,
        "startup.openOnStart": DEFAULT_SETTINGS.startupOpenOnStart,
        "startup.shortcuts": DEFAULT_SETTINGS.startupShortcuts,
        "whatsapp.bridgeUrl": DEFAULT_SETTINGS.whatsappBridgeUrl,
      },
    });
  }
  return _store;
}

/** Narrow a persisted openOnStart value: drop malformed entries, trim values. */
function sanitizeOpenItems(raw: unknown): StartupOpenItem[] {
  if (!Array.isArray(raw)) return [];
  const items: StartupOpenItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const type = (entry as Record<string, unknown>)["type"];
    const value = (entry as Record<string, unknown>)["value"];
    if ((type === "url" || type === "app") && typeof value === "string" && value.trim()) {
      items.push({ type, value: value.trim() });
    }
  }
  return items;
}

/** Narrow a persisted shortcuts value: keep non-empty strings only. */
function sanitizeShortcuts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .map((name) => name.trim());
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
  const wakeEnabled = await store.get<boolean>("wake.enabled");
  const wakeExplicit = await store.get<boolean>(WAKE_EXPLICIT_KEY);
  const startupBriefingEnabled = await store.get<boolean>("startup.briefingEnabled");
  const startupOpenOnStart = await store.get<unknown>("startup.openOnStart");
  const startupShortcuts = await store.get<unknown>("startup.shortcuts");
  const whatsappBridgeUrl = await store.get<string>("whatsapp.bridgeUrl");

  return {
    ttsEnabled: ttsEnabled ?? DEFAULT_SETTINGS.ttsEnabled,
    ttsVoiceId: ttsVoiceId ?? DEFAULT_SETTINGS.ttsVoiceId,
    ttsProvider: ttsProvider ?? DEFAULT_SETTINGS.ttsProvider,
    physicalExtenderEnabled: physicalExtenderEnabled ?? DEFAULT_SETTINGS.physicalExtenderEnabled,
    vadSilenceMs: vadSilenceMs ?? DEFAULT_SETTINGS.vadSilenceMs,
    manualMode: manualMode ?? DEFAULT_SETTINGS.manualMode,
    // Opt-in: only honor a persisted wake.enabled that the user explicitly set
    // (marker present). Anything else — unset, or baked by an old defaults
    // map — resolves to the OFF default. See WAKE_EXPLICIT_KEY.
    wakeEnabled: wakeExplicit === true ? (wakeEnabled ?? DEFAULT_SETTINGS.wakeEnabled) : DEFAULT_SETTINGS.wakeEnabled,
    startupBriefingEnabled: startupBriefingEnabled ?? DEFAULT_SETTINGS.startupBriefingEnabled,
    startupOpenOnStart: sanitizeOpenItems(startupOpenOnStart),
    startupShortcuts: sanitizeShortcuts(startupShortcuts),
    whatsappBridgeUrl:
      typeof whatsappBridgeUrl === "string" && whatsappBridgeUrl.trim()
        ? whatsappBridgeUrl.trim()
        : DEFAULT_SETTINGS.whatsappBridgeUrl,
  };
}

/** Persist a single setting by key. */
export async function saveSetting<K extends keyof DesktopSettings>(
  key: K,
  value: DesktopSettings[K],
): Promise<void> {
  const store = await getStore();
  await store.set(STORE_KEYS[key], value);
  if (key === "wakeEnabled") {
    // The user actually flipped the wake toggle — mark the persisted value as
    // explicit so loadSettings trusts it from now on (see WAKE_EXPLICIT_KEY).
    await store.set(WAKE_EXPLICIT_KEY, true);
  }
}
