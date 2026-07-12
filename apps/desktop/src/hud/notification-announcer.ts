// apps/desktop/src/hud/notification-announcer.ts
//
// The incoming-message notification announcer: JARVIS comes up and tells you
// when a new WhatsApp / iMessage lands from someone. It polls the two recent-
// incoming endpoints on a short interval, uses the pure watcher logic to decide
// what is genuinely new (per-channel watermark + a session-start floor so a
// relaunch never replays history) and to collapse group-spam storms, then for
// each announcement:
//
//   (a) surfaces a compact toast near the orb (always, when notifications on),
//   (b) opens/focuses the WhatsApp widget to that chat (WhatsApp only — there
//       is no iMessage widget yet), routed ONLY through the studio-action
//       router / summon API (never touching Drawer/WidgetWindow internals),
//   (c) speaks it in the butler register IF auto-read is on.
//
// Deferral: TTS is gated on the conversation FSM being idle — we never speak
// over the user mid-turn (listening/thinking/speaking) or while TTS is already
// playing. A deferred announcement's toast still shows immediately (silent);
// only the speech waits, and stale speech (older than DEFER_TTL_MS) is dropped
// rather than spoken late.
//
// Everything here is additive + fail-safe: a failed poll skips one tick, and a
// disabled master toggle stops announcements entirely.

import { getImessageRecent, getWhatsappRecent, type IncomingMessage } from "@/api/client";
import { getJarvisState } from "@/conversation/state-machine";
import { ttsPlayer } from "@/jarvis-response";
import { routeStudioAction } from "@studio/actions/studio-action-router";
import {
  getHudSettings,
  hydrateHudSettings,
} from "@studio/state/hud-settings";

import {
  planAnnouncements,
  selectFresh,
  spokenLine,
  toastLine,
  type Announcement,
  type Watermark,
  type WatcherMessage,
} from "./notification-watcher";
import { showNotificationToast } from "./notification-toast";

/** Poll cadence while the HUD runs. ~5s per the seed — fresh enough to feel
 *  immediate, gentle enough on the synced-source endpoints. */
const POLL_INTERVAL_MS = 5_000;
/** A queued (deferred-for-TTS) announcement older than this is dropped rather
 *  than spoken late — a message from 30s ago read aloud now reads as stale. */
const DEFER_TTL_MS = 30_000;

/** Per-channel high-water marks, advanced by selectFresh each poll. */
const watermarks: Record<IncomingMessage["channel"], Watermark> = {
  whatsapp: null,
  imessage: null,
};

/** Session-start floor: on first run we ignore anything older than this so a
 *  relaunch never replays old messages. Set on start(). */
let startFloorIso = new Date().toISOString();

/** Announcements whose TTS was deferred because the FSM was busy. Their toast
 *  already showed; only speech waits for idle. */
const pendingSpeech: Array<{ announcement: Announcement; queuedAt: number }> = [];

let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Whether it is safe to speak right now: the conversation FSM is idle and no
 *  TTS is currently playing. Half-duplex-adjacent — we never talk over a turn. */
function canSpeakNow(): boolean {
  return getJarvisState() === "idle" && ttsPlayer.getState() !== "playing";
}

/** Speak an announcement in the butler register through the shared TTS path.
 *  speakNow respects the TTS enabled flag + the local-voice fallback. */
function speak(announcement: Announcement): void {
  ttsPlayer.speakNow(spokenLine(announcement));
}

/** Open/focus the WhatsApp widget to the announced chat via the studio-action
 *  router (the SAME path the send-receipt focus flow uses). iMessage has no
 *  widget yet, so it is toast/speech only. */
function openWidgetFor(announcement: Announcement): void {
  if (announcement.channel !== "whatsapp") return;
  routeStudioAction({
    action: "open",
    kind: "whatsapp",
    props: {
      focusChatJid: announcement.chatJid,
      focusChatName: announcement.senderName,
      focusAt: Date.now(),
    },
  });
}

/** Flush any deferred speech now that the FSM is (or may be) idle. Drops stale
 *  entries past the TTL. Speaks at most one per flush so a backlog doesn't
 *  monologue; the next idle window speaks the next one. */
function flushPendingSpeech(): void {
  if (pendingSpeech.length === 0) return;
  const now = Date.now();
  // Drop stale entries from the front.
  while (pendingSpeech.length > 0 && now - pendingSpeech[0]!.queuedAt > DEFER_TTL_MS) {
    pendingSpeech.shift();
  }
  if (pendingSpeech.length === 0 || !canSpeakNow()) return;
  const next = pendingSpeech.shift()!;
  speak(next.announcement);
}

/** Handle one announcement: toast now (always), open the widget (WhatsApp),
 *  and speak now-or-deferred if auto-read is on. */
function announce(announcement: Announcement): void {
  const settings = getHudSettings();

  const line = toastLine(announcement);
  showNotificationToast({
    channel: line.channel,
    sender: line.sender,
    preview: line.preview,
  });

  openWidgetFor(announcement);

  if (!settings.messageAutoReadEnabled) return;
  if (canSpeakNow()) {
    speak(announcement);
  } else {
    // Defer: don't talk over the user's turn. Toast already showed.
    pendingSpeech.push({ announcement, queuedAt: Date.now() });
  }
}

/** One poll pass for one channel: fetch since the watermark, select the fresh
 *  ones, advance the watermark, and hand the fresh batch to the planner. */
async function tickChannel(
  channel: IncomingMessage["channel"],
  fetcher: (since: string | null) => Promise<IncomingMessage[]>,
): Promise<WatcherMessage[]> {
  const rows = await fetcher(watermarks[channel]);
  const { fresh, watermark } = selectFresh(rows, watermarks[channel], startFloorIso);
  watermarks[channel] = watermark;
  return fresh;
}

/** One full poll: both channels, planned together so cross-channel ordering is
 *  chronological, then announced. Any error is swallowed so the loop survives. */
async function tick(): Promise<void> {
  // First, try to drain any deferred speech if we're idle now.
  flushPendingSpeech();

  const settings = getHudSettings();
  if (!settings.messageNotificationsEnabled) return;

  try {
    const [wa, im] = await Promise.all([
      tickChannel("whatsapp", getWhatsappRecent),
      tickChannel("imessage", getImessageRecent),
    ]);
    const fresh = [...wa, ...im];
    if (fresh.length === 0) return;
    for (const announcement of planAnnouncements(fresh)) announce(announcement);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[noti-announcer] tick failed", err);
  }
}

/**
 * Start the announcer poll loop. Idempotent (matches the HUD modules' `started`
 * guard). Sets the session-start floor to now so the first poll never replays
 * history, then polls every POLL_INTERVAL_MS. Called once from boot().
 */
export function startNotificationAnnouncer(): void {
  if (started) return;
  started = true;
  hydrateHudSettings();
  startFloorIso = new Date().toISOString();
  // Kick an immediate poll so the watermark seeds before the first interval;
  // with the start floor in place this announces nothing pre-existing.
  void tick();
  pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
}

/** Stop the loop (used by tests / teardown). */
export function stopNotificationAnnouncer(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  started = false;
  pendingSpeech.length = 0;
}
