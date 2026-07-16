/**
 * studio-sfx — the HUD's tiny UI sound layer.
 *
 * Two cues, both reusing the web app's own assets (bundled locally under
 * `apps/desktop/public/` so nothing is fetched from a CDN):
 *   - `pop`  → the soft tab-change pop played when a widget lands / is summoned
 *              (web's `/pop.mp3`, the tab-switch cue).
 *   - `send` → the message-sent cue played when an outgoing message is
 *              dispatched (web's `/message-sent.mp3`, the "send to JARVIS" cue).
 *
 * Both respect the persisted `soundEnabled` HUD setting (the Settings widget's
 * Sound toggle) and the OS `prefers-reduced-motion` signal, matching the web's
 * discipline where audio is a non-essential nicety: every failure path (autoplay
 * block, decode error, storage unavailable) is swallowed so playback never
 * blocks the interaction that triggered it.
 */

import { getHudSettings, hydrateHudSettings } from "../state/hud-settings";

type SfxName = "pop" | "send";

const SRC: Record<SfxName, string> = {
  pop: "/pop.mp3",
  send: "/message-sent.mp3",
};

const VOLUME: Record<SfxName, number> = {
  pop: 0.35,
  send: 0.4,
};

/** One reused Audio element per cue, rewound on each play so back-to-back
 *  triggers retrigger cleanly (matches web play-pop/play-send). */
const elements = new Map<SfxName, HTMLAudioElement>();

function soundAllowed(): boolean {
  if (typeof window === "undefined") return false;
  // Respect the persisted mute toggle. Hydrate lazily so a first play right
  // after boot still honours a stored preference.
  hydrateHudSettings();
  if (!getHudSettings().soundEnabled) return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    // matchMedia unavailable (older test env): fall through and allow.
  }
  return true;
}

function play(name: SfxName): void {
  if (!soundAllowed()) return;
  try {
    let audio = elements.get(name);
    if (!audio) {
      audio = new Audio(SRC[name]);
      audio.volume = VOLUME[name];
      elements.set(name, audio);
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // ignore — audio is a nicety, never block the interaction on it.
  }
}

/** Soft pop when a widget lands on the stage (drop / summon). */
export function playDropPop(): void {
  play("pop");
}

/** Message-sent cue when an outgoing message is confirmed/dispatched. */
export function playSendSound(): void {
  play("send");
}
