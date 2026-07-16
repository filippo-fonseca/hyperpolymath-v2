// apps/desktop/src/hud/notification-watcher.ts
//
// Pure, side-effect-free logic for the incoming-message notification watcher.
// The orchestrator (notification-announcer.ts) owns the polling, TTS, toast,
// and widget-summon; THIS module owns only the decision logic so it can be
// unit-tested without a network, a clock, or the DOM:
//
//   1. selectFresh — from a poll's raw messages, drop anything at/before the
//      per-channel watermark and anything older than the session start floor
//      (so a relaunch never replays history), and advance the watermark. This
//      is the "what's genuinely new since last time" filter.
//   2. planAnnouncements — from the fresh messages, collapse a group-spam storm
//      (>SPAM_THRESHOLD from ONE chat within SPAM_WINDOW_MS) into a single
//      summary announcement, and emit the rest as individual announcements.
//
// A "channel" here is "whatsapp" | "imessage"; watermarks are tracked per
// channel by the caller. Timestamps are ISO strings compared as Date millis.

/** A raw incoming message as returned by the recent-poll client fns. */
export interface WatcherMessage {
  channel: "whatsapp" | "imessage";
  chatJid: string;
  senderName: string;
  body: string | null;
  sentAt: string;
}

/** Per-channel high-water mark: the sentAt (ISO) of the newest message we have
 *  already processed. `null` means "nothing seen yet this session". */
export type Watermark = string | null;

/** More than this many messages from ONE chat inside SPAM_WINDOW_MS collapses
 *  into a single summary announcement instead of N separate ones. */
export const SPAM_THRESHOLD = 3;
/** The sliding window over which SPAM_THRESHOLD is measured. */
export const SPAM_WINDOW_MS = 10_000;

function toMillis(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Filter a poll's raw messages down to the ones that are genuinely NEW, and
 * compute the advanced watermark.
 *
 * A message survives when its sentAt is strictly AFTER both:
 *   - the current per-channel `watermark` (already-seen floor), and
 *   - `startFloorIso` (session start — ignore anything older than app start so
 *     a relaunch doesn't replay old messages on the very first poll).
 *
 * The returned `watermark` is the max of the old watermark and the newest
 * surviving message's timestamp, so the next poll's `since` moves forward even
 * across ties. Input order is irrelevant; `fresh` is returned oldest-first so
 * the caller announces in chronological order.
 */
export function selectFresh(
  messages: readonly WatcherMessage[],
  watermark: Watermark,
  startFloorIso: string,
): { fresh: WatcherMessage[]; watermark: Watermark } {
  const floor = Math.max(watermark ? toMillis(watermark) : 0, toMillis(startFloorIso));

  const fresh = messages
    .filter((m) => toMillis(m.sentAt) > floor)
    .slice()
    .sort((a, b) => toMillis(a.sentAt) - toMillis(b.sentAt));

  let nextWatermarkMs = watermark ? toMillis(watermark) : 0;
  for (const m of fresh) nextWatermarkMs = Math.max(nextWatermarkMs, toMillis(m.sentAt));
  // Also advance past the floor even when nothing survived, so a quiet channel's
  // watermark still tracks forward and we never re-scan the same window.
  nextWatermarkMs = Math.max(nextWatermarkMs, watermark ? toMillis(watermark) : 0);

  const nextWatermark: Watermark =
    fresh.length > 0 ? new Date(nextWatermarkMs).toISOString() : watermark;

  return { fresh, watermark: nextWatermark };
}

/** One planned announcement: either a single message, or a per-chat summary of
 *  a burst. `count` > 1 marks a collapsed storm; `body` is the representative
 *  (latest) message text for a single, or null for a pure summary. */
export interface Announcement {
  channel: "whatsapp" | "imessage";
  chatJid: string;
  senderName: string;
  body: string | null;
  sentAt: string;
  /** How many messages this announcement stands for (1 = a single message). */
  count: number;
}

/**
 * Turn a batch of fresh (already chronological) messages into announcements,
 * collapsing group-spam storms. Grouping key is `channel:chatJid`. If a chat
 * produced more than SPAM_THRESHOLD messages whose span fits within
 * SPAM_WINDOW_MS, that chat emits ONE summary announcement (count = N, using
 * the latest message's sender/time, body = null). Otherwise each message emits
 * its own announcement. Output order follows each group's LATEST message time,
 * so the most recent activity is announced last (closest to "now").
 */
export function planAnnouncements(fresh: readonly WatcherMessage[]): Announcement[] {
  if (fresh.length === 0) return [];

  const groups = new Map<string, WatcherMessage[]>();
  for (const m of fresh) {
    const key = `${m.channel}:${m.chatJid}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  const announcements: Announcement[] = [];
  for (const list of groups.values()) {
    const sorted = list.slice().sort((a, b) => toMillis(a.sentAt) - toMillis(b.sentAt));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const spanMs = toMillis(last.sentAt) - toMillis(first.sentAt);

    if (sorted.length > SPAM_THRESHOLD && spanMs <= SPAM_WINDOW_MS) {
      announcements.push({
        channel: last.channel,
        chatJid: last.chatJid,
        senderName: last.senderName,
        body: null,
        sentAt: last.sentAt,
        count: sorted.length,
      });
    } else {
      for (const m of sorted) {
        announcements.push({
          channel: m.channel,
          chatJid: m.chatJid,
          senderName: m.senderName,
          body: m.body,
          sentAt: m.sentAt,
          count: 1,
        });
      }
    }
  }

  return announcements.sort((a, b) => toMillis(a.sentAt) - toMillis(b.sentAt));
}

/** Build the compact toast line for an announcement, e.g.
 *  "WhatsApp · Rohan: first ~80 chars…" or, for a collapsed storm,
 *  "WhatsApp · Family: 5 new messages". Pure so it's testable. */
export function toastLine(a: Announcement, maxBody = 80): { channel: string; sender: string; preview: string } {
  const channel = a.channel === "whatsapp" ? "WhatsApp" : "iMessage";
  if (a.count > 1) {
    return { channel, sender: a.senderName, preview: `${a.count} new messages` };
  }
  const raw = (a.body ?? "").replace(/\s+/g, " ").trim();
  const preview = raw.length > maxBody ? `${raw.slice(0, maxBody).trimEnd()}…` : raw || "(no text)";
  return { channel, sender: a.senderName, preview };
}

/** Build the spoken utterance for an announcement, in the butler register:
 *  "Sir, Rohan on WhatsApp says: …" or "Sir, 5 new messages from Family on
 *  WhatsApp." Pure so it's testable. */
export function spokenLine(a: Announcement, maxBody = 220): string {
  const channel = a.channel === "whatsapp" ? "WhatsApp" : "iMessage";
  if (a.count > 1) {
    return `Sir, ${a.count} new messages from ${a.senderName} on ${channel}.`;
  }
  const raw = (a.body ?? "").replace(/\s+/g, " ").trim();
  const spoken = raw.length > maxBody ? `${raw.slice(0, maxBody).trimEnd()}…` : raw;
  if (!spoken) return `Sir, ${a.senderName} messaged you on ${channel}.`;
  return `Sir, ${a.senderName} on ${channel} says: ${spoken}`;
}
