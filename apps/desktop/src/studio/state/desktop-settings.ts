/**
 * Desktop settings store — the React face of the tauri-plugin-store settings
 * that {@link ../../settings} owns.
 *
 * The unified Settings surface needs to read and write the same eleven keys the
 * legacy DOM drawer used to (TTS, capture, wake, startup, WhatsApp), but those
 * live behind an ASYNC store while React wants a synchronous snapshot. This
 * module is that adapter: one `useSyncExternalStore` slice, hydrated once from
 * `loadSettings()`, written through `saveSetting()`.
 *
 * Two properties are load-bearing and easy to lose:
 *
 * 1. **Every write goes through `saveSetting()`.** That is the ONLY function
 *    that writes the `wake.enabledExplicit` marker, and `loadSettings()`
 *    ignores a persisted `wake.enabled` without it. Bypassing `saveSetting`
 *    (e.g. writing the store directly) would silently turn wake mode ON for
 *    installs carrying the old baked default, which re-lights the macOS mic
 *    indicator permanently. Do not "optimise" the write path.
 *
 * 2. **Live-apply effects are injected, not imported.** Flipping TTS must call
 *    `ttsPlayer.setEnabled`, wake must call `setWakeEnabled`, PE must
 *    re-register the global shortcut, and so on. Those all live in main.ts's
 *    import graph; importing them here would drag the whole HUD into any widget
 *    that reads a setting. Instead main.ts registers them via
 *    {@link setSettingsEffects} at boot — the same seam idiom as
 *    `setWakeTriggerHandler` / `setPhraseMatcher`. Without the seam wired, a
 *    flip still PERSISTS; it just doesn't apply until restart. Effects are
 *    fired after the in-memory state updates and before the async write lands.
 *
 * When the tauri store is unreachable (the widget debug stage, tests) the store
 * stays on {@link DEFAULT_SETTINGS} and reports `status: "unavailable"`, so the
 * surface renders real defaults rather than blanks and writes become no-ops.
 */

import { useSyncExternalStore } from "react";

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSetting,
  type DesktopSettings,
  type StartupOpenItem,
} from "@/settings";

/** Hydration lifecycle. `unavailable` means there is no tauri store to talk to. */
export type DesktopSettingsStatus = "loading" | "ready" | "unavailable";

export interface DesktopSettingsState {
  status: DesktopSettingsStatus;
  settings: DesktopSettings;
}

/**
 * The live-apply side effects the settings surface must trigger on a flip.
 * Every one of these hangs off a DOM handler in the legacy drawer today; they
 * are re-attached here so a React flip stays live rather than restart-required.
 * All optional — an unwired seam degrades to persist-only.
 */
export interface SettingsEffects {
  /** Apply TTS enablement. Called with the RESOLVED value (provider "off" wins). */
  onTtsChange?: (speaking: boolean) => void;
  /** Apply a new ElevenLabs voice id. */
  onVoiceIdChange?: (voiceId: string) => void;
  /** Apply the physical-extender mode (also re-registers the global shortcut). */
  onPhysicalExtenderChange?: (enabled: boolean) => void;
  /** Apply the VAD end-of-turn silence window. */
  onVadSilenceChange?: (ms: number) => void;
  /** Apply manual (open-mic) mode. */
  onManualModeChange?: (enabled: boolean) => void;
  /** Start/stop the idle wake listener. */
  onWakeChange?: (enabled: boolean) => void;
}

let effects: SettingsEffects = {};

/** Register the live-apply effects. Called once from main.ts's boot(). */
export function setSettingsEffects(next: SettingsEffects): void {
  effects = next;
}

let state: DesktopSettingsState = { status: "loading", settings: DEFAULT_SETTINGS };

const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

function patch(partial: Partial<DesktopSettings>): void {
  state = { ...state, settings: { ...state.settings, ...partial } };
  emit();
}

export function getDesktopSettingsState(): DesktopSettingsState {
  return state;
}

export function subscribeDesktopSettings(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

let hydrating: Promise<void> | null = null;

/**
 * Read the persisted settings once. Safe to call repeatedly and concurrently —
 * the in-flight promise is shared, so N mounting widgets cause ONE store read.
 */
export function hydrateDesktopSettings(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const settings = await loadSettings();
      state = { status: "ready", settings };
    } catch {
      // No tauri store (debug stage / tests): keep defaults, mark unavailable
      // so writes no-op instead of throwing on every flip.
      state = { status: "unavailable", settings: DEFAULT_SETTINGS };
    }
    emit();
  })();
  return hydrating;
}

/**
 * Optimistically apply `partial`, run `effect`, then persist through
 * `saveSetting`. A failed write rolls the slice back so the UI never claims a
 * value the store rejected.
 */
function write<K extends keyof DesktopSettings>(
  key: K,
  value: DesktopSettings[K],
  effect?: () => void,
): void {
  const previous = state.settings[key];
  patch({ [key]: value } as Partial<DesktopSettings>);
  effect?.();
  if (state.status === "unavailable") return;
  void saveSetting(key, value).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`[desktop-settings] failed to persist ${String(key)}`, err);
    patch({ [key]: previous } as Partial<DesktopSettings>);
  });
}

/** Resolve whether TTS should actually speak: provider "off" beats the toggle. */
function speaks(enabled: boolean, provider: DesktopSettings["ttsProvider"]): boolean {
  return enabled && provider !== "off";
}

export function setTtsEnabled(enabled: boolean): void {
  write("ttsEnabled", enabled, () =>
    effects.onTtsChange?.(speaks(enabled, state.settings.ttsProvider)),
  );
}

export function setTtsProvider(provider: DesktopSettings["ttsProvider"]): void {
  write("ttsProvider", provider, () =>
    effects.onTtsChange?.(speaks(state.settings.ttsEnabled, provider)),
  );
}

export function setTtsVoiceId(voiceId: string): void {
  const trimmed = voiceId.trim();
  if (!trimmed) return;
  write("ttsVoiceId", trimmed, () => effects.onVoiceIdChange?.(trimmed));
}

export function setPhysicalExtenderEnabled(enabled: boolean): void {
  write("physicalExtenderEnabled", enabled, () => effects.onPhysicalExtenderChange?.(enabled));
}

export function setVadSilenceMs(ms: number): void {
  if (!Number.isFinite(ms)) return;
  write("vadSilenceMs", ms, () => effects.onVadSilenceChange?.(ms));
}

export function setManualMode(enabled: boolean): void {
  write("manualMode", enabled, () => effects.onManualModeChange?.(enabled));
}

export function setWakeEnabled(enabled: boolean): void {
  // saveSetting("wakeEnabled", …) is what writes wake.enabledExplicit. See the
  // module header — this path must never be swapped for a raw store write.
  write("wakeEnabled", enabled, () => effects.onWakeChange?.(enabled));
}

export function setStartupBriefingEnabled(enabled: boolean): void {
  write("startupBriefingEnabled", enabled);
}

export function setStartupOpenOnStart(items: StartupOpenItem[]): void {
  write("startupOpenOnStart", items);
}

export function setStartupShortcuts(names: string[]): void {
  write("startupShortcuts", names);
}

export function setWhatsappBridgeUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  write("whatsappBridgeUrl", trimmed);
}

/**
 * Reflect a manual-mode change that came from somewhere else (the ⌘⌃E
 * shortcut). Updates the slice WITHOUT persisting or re-firing the effect —
 * the origin already did both.
 */
export function syncManualModeFromRuntime(enabled: boolean): void {
  if (state.settings.manualMode === enabled) return;
  patch({ manualMode: enabled });
}

export function useDesktopSettings(): DesktopSettingsState {
  return useSyncExternalStore(
    subscribeDesktopSettings,
    getDesktopSettingsState,
    getDesktopSettingsState,
  );
}
