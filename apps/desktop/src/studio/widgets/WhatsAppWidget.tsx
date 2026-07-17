import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WhatsappIcon } from "@hyperpolymath/ui-icons";

import {
  SD_ACCENT,
  SD_DURATION,
  SD_FONT,
  SD_FUNCTIONAL,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
} from "../tokens";
import type { WidgetContentProps } from "../windows/catalog";
import { fetchStudioWidget } from "./widget-fetch";
import {
  buildConversationRows,
  isPendingReconciled,
  mergePendingForChat,
  normalizeBody,
  RECONCILE_RETRY_MS,
  type ConversationMessage,
  type MessageRow,
  type PendingSend,
} from "./whatsapp-conversation";
import { pickContactName, resolveContactName } from "./whatsapp-contacts";

// MAJOR-5 — Widget is refetched every ACTIVE_POLL_MS while the HUD is
// visible. When `document.hidden` (HUD stowed, workspace switch, machine
// asleep), polling pauses entirely — we still refetch on window focus so
// the "back at desk" refresh works. The Realtime-invalidation pattern
// (per CLAUDE.md "Realtime as invalidation signal") is the eventual home,
// but a per-user Realtime channel is a bigger change; this cuts the
// unconditional pinning without that scope.
const ACTIVE_POLL_MS = 60_000;

// The widget is a real client operable by BOTH the mouse and the synthesized
// hand pointer. Every interactive target is ≥ this many px on its short axis so
// the index-finger raycast can land it, and the conversation history uses a
// DOM-native scroll container so the pointer's scroll pose drives it.
const MIN_TARGET_PX = 36;

function useDocumentHidden(): boolean {
  const subscribe = React.useCallback((cb: () => void) => {
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  }, []);
  const getSnapshot = React.useCallback(() => {
    if (typeof document === "undefined") return false;
    return document.hidden;
  }, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

interface ChatListItem {
  chatJid: string;
  chatName: string;
  lastBody: string | null;
  lastFromMe: boolean;
  lastAt: string;
  attention: boolean;
}

interface ChatListReceipt extends Record<string, unknown> {
  mode: "chats";
  chats: ChatListItem[];
  totalCount: number;
  note?: string;
}

interface HistoryMessage {
  senderName: string | null;
  fromMe: boolean;
  body: string | null;
  sentAt: string;
}

interface ChatHistoryReceipt extends Record<string, unknown> {
  mode: "chat";
  chatJid: string;
  chatName: string;
  messages: HistoryMessage[];
}

/** Focus props threaded via a studio-action after a confirmed JARVIS send:
 *  open THIS chat and briefly highlight the just-sent message. */
interface FocusChatProps {
  focusChatJid?: string;
  focusChatName?: string;
  /** Body of the message JARVIS just sent — matched to pulse-highlight it. */
  focusMessageBody?: string;
  /** Monotonic marker so a repeated focus of the same chat re-triggers the
   *  navigation + pulse even when the jid is unchanged. */
  focusAt?: number;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Resolve a chat's macOS Contacts name asynchronously (cached; never blocks
 *  render). Returns null until (and unless) a name lands, so callers compose it
 *  through pickContactName(contactsName, syncedName, fallback). Groups and
 *  numberless chats resolve to null and keep their synced label. */
function useContactName(jid: string): string | null {
  const [name, setName] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setName(null);
    void resolveContactName(jid).then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [jid]);
  return name;
}

/* ── The sd register, hand-rolled ──────────────────────────────────────────
 * apps/desktop has no Tailwind, so the contract's class strings (`text-tiny`,
 * `rounded-[14px]`, `bg-[var(--sd-box)]`) cannot be emitted here. Inline style is
 * the sanctioned route (DS §23) and the default mechanism in this app.
 *
 * These read the TS mirror in tokens.ts rather than `var(--sd-*)` on purpose:
 * only the debug harness imports sd-tokens.css today — index.html is unit 3's
 * fence and is not wired to it yet — so a `var()` lookup would resolve to
 * nothing in the shipped Tauri app. The constants are the same values as
 * literals, so they are correct in both. Swap to `var()` once unit 3 lands.
 */

/** Mono eyebrow (DS §3): the caption face, 11px, uppercase, wide tracking. */
const monoEyebrow: React.CSSProperties = {
  color: SD_INK.faint,
  fontFamily: SD_FONT.mono,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

/** Mono micro-caption for timestamps — the eyebrow face one step down. */
const monoCaption: React.CSSProperties = {
  color: SD_INK.faint,
  fontFamily: SD_FONT.mono,
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
};

/** The verbatim chip (DS §10) in its cyan tone: text in the hue, border a 30%
 *  mix into the line, fill a 15% mix into the box. Never an accent-filled pill. */
const cyanChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
  padding: "1px 6px",
  borderRadius: SD_RADIUS.chip,
  border: `1px solid color-mix(in srgb, ${SD_ACCENT} 30%, ${SD_SURFACES.line})`,
  color: SD_ACCENT,
  background: `color-mix(in srgb, ${SD_ACCENT} 15%, ${SD_SURFACES.box})`,
  fontSize: 10.4 /* text-tiny, 0.65rem */,
  fontWeight: 500,
  letterSpacing: "0.02em",
};

const hairline = `1px solid ${SD_SURFACES.line}`;

/** Inner content goes SOLID (sealed D1): glass is for chrome, and this is
 *  inside the chrome. Space Grotesk is set here because index.html still hands
 *  down -apple-system until unit 3 rewires it. */
const contentRoot: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  color: SD_INK.base,
  background: SD_SURFACES.box,
  fontFamily: SD_FONT.sans,
};

/** A 6px status dot — the one shape the accent is allowed to take on a row
 *  (DS §2), paired with the neutral backplate of the two-tier law (DS §4). */
const unreadDot: React.CSSProperties = {
  display: "block",
  width: 6,
  height: 6,
  flexShrink: 0,
  borderRadius: "50%",
  background: SD_ACCENT,
};

// ── Chat list view ──────────────────────────────────────────────────────────

function ChatList({
  onOpenChat,
}: {
  onOpenChat: (jid: string, name: string) => void;
}): React.ReactElement {
  const hidden = useDocumentHidden();
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "whatsapp", "chats"],
    queryFn: () => fetchStudioWidget<ChatListReceipt>("/api/studio/whatsapp?list=chats"),
    refetchInterval: hidden ? false : ACTIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return <div style={{ height: "100%", background: SD_SURFACES.box }} />;
  }
  if (error) {
    return (
      <div style={contentRoot}>
        <p style={{ padding: 16, margin: 0, color: SD_FUNCTIONAL.coral, fontSize: 12 }}>
          {error.message}
        </p>
      </div>
    );
  }

  const chats = data?.chats ?? [];
  const attentionCount = chats.filter((c) => c.attention).length;

  return (
    <div style={contentRoot}>
      {/* Header: the feature's dimensional icon (DS §13 — nouns get dimensional
          icons) + a mono eyebrow + the unreplied count as a tinted chip. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          padding: "9px 10px",
          borderBottom: hairline,
        }}
      >
        {/* 24px: the size DS §13 says the dimensional family reads cleanly at.
            At the 18px floor this motif silts up into a blob on --sd-box. */}
        <WhatsappIcon size={24} />
        <span style={{ ...monoEyebrow, minWidth: 0, flex: 1 }}>Recent chats</span>
        {attentionCount > 0 ? (
          <span style={cyanChip}>{attentionCount} unreplied</span>
        ) : null}
      </div>

      <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
        {chats.length === 0 ? (
          /* Empty state (DS §9): plain ink-faint copy over a 40px dimensional
             icon at 40% opacity. No italic serif. */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <span style={{ opacity: 0.4, lineHeight: 0 }}>
              <WhatsappIcon size={40} />
            </span>
            <p style={{ margin: 0, color: SD_INK.faint, fontSize: 13 }}>
              {data?.note ?? "No recent messages."}
            </p>
          </div>
        ) : (
          chats.map((chat, index) => (
            <ChatRow
              key={chat.chatJid}
              chat={chat}
              divided={index > 0}
              onOpenChat={onOpenChat}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** One chat-list row. The display name resolves the user's macOS Contacts name
 *  (via useContactName) over the synced WhatsApp name / pretty number, updating
 *  asynchronously as the lookup lands — the row renders immediately regardless. */
function ChatRow({
  chat,
  divided,
  onOpenChat,
}: {
  chat: ChatListItem;
  /** Hairline above this row — every row but the first, so the header's own
   *  hairline is not doubled. */
  divided: boolean;
  onOpenChat: (jid: string, name: string) => void;
}): React.ReactElement {
  const contactsName = useContactName(chat.chatJid);
  const displayName = pickContactName(contactsName, chat.chatName, chat.chatName);
  const [hovered, setHovered] = React.useState(false);

  // The two-tier selection law (DS §4): an unread row takes the NEUTRAL
  // backplate and the accent appears only as a 6px dot on the label. The old
  // accent border was an accent ring, which §16 bans outright.
  const background = chat.attention
    ? SD_SURFACES.selected
    : hovered
      ? SD_SURFACES.hover
      : "transparent";

  return (
    <button
      type="button"
      onClick={() => onOpenChat(chat.chatJid, displayName)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        minHeight: MIN_TARGET_PX,
        padding: "8px 10px",
        textAlign: "left",
        border: 0,
        borderTop: divided ? hairline : undefined,
        color: SD_INK.base,
        background,
        cursor: "pointer",
        font: "inherit",
        transition: `background-color ${SD_DURATION.micro}ms ease-out`,
      }}
    >
      {/* The dot lives in its own reserved gutter, so the name and the preview
          line share one rail and read/unread rows do not shift (DS §6). */}
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ display: "flex", width: 6, flexShrink: 0, paddingTop: 5 }}>
          {chat.attention ? <span style={unreadDot} /> : null}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span
              style={{
                minWidth: 0,
                flex: 1,
                overflow: "hidden",
                color: chat.attention || hovered ? SD_INK.base : SD_INK.dull,
                fontWeight: chat.attention ? 600 : 500,
                letterSpacing: "-0.01em",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                transition: `color ${SD_DURATION.micro}ms ease-out`,
              }}
            >
              {displayName}
            </span>
            <time style={{ ...monoCaption, flexShrink: 0 }}>{timeLabel(chat.lastAt)}</time>
          </div>
          <p
            style={{
              margin: "3px 0 0",
              overflow: "hidden",
              color: SD_INK.dull,
              fontSize: 11,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chat.lastFromMe ? "You: " : ""}
            {chat.lastBody ?? "Media message"}
          </p>
        </div>
      </div>
    </button>
  );
}

// ── Conversation view ───────────────────────────────────────────────────────

function Conversation({
  chatJid,
  chatName,
  highlightBody,
  highlightNonce,
  onBack,
}: {
  chatJid: string;
  chatName: string;
  highlightBody?: string;
  highlightNonce?: number;
  onBack: () => void;
}): React.ReactElement {
  const hidden = useDocumentHidden();
  const queryClient = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const queryKey = React.useMemo(() => ["studio", "whatsapp", "chat", chatJid], [chatJid]);
  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      fetchStudioWidget<ChatHistoryReceipt>(
        `/api/studio/whatsapp?chat=${encodeURIComponent(chatJid)}`,
      ),
    refetchInterval: hidden ? false : ACTIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const fetched = React.useMemo<ConversationMessage[]>(
    () => data?.messages ?? [],
    [data?.messages],
  );

  // INSTANT FRESHNESS + RECONCILE. The real ~1-minute lag was two things: the
  // 60s widget poll, AND that the sync worker only copies bridge→Postgres every
  // ~15s, so an immediate refetch fires before the just-sent row exists and,
  // previously, NOTHING refetched again until the 60s tick — so the optimistic
  // "sending…" bubble sat there forever. Fix: on a confirmed send (focusAt
  // bumps), record a PendingSend and schedule a burst of short refetches
  // (RECONCILE_RETRY_MS: ~3/8/15/25/40/60s) until a matching synced row lands.
  // The pending bubble reconciles against synced rows via pendingMatchesSynced
  // (from-me, normalized-equal body, ±90s window — timestamps differ between the
  // local clock and the bridge stamp). Once matched, the bubble is dropped for
  // the real row. If the schedule exhausts without a match (~60s), the bubble
  // flips to sent-unconfirmed rather than an eternal "sending…".
  // A focused send targets THIS chat: highlightBody is only ever passed for the
  // focused jid, and highlightNonce (focusAt) bumps on each confirmed send.
  const isFocusedSend = !!highlightBody && (highlightNonce ?? 0) > 0;

  // The optimistic just-sent message we're tracking to reconciliation, plus
  // whether the retry schedule has exhausted (→ show as sent-unconfirmed).
  const [pending, setPending] = React.useState<PendingSend | null>(null);
  const [pendingExhausted, setPendingExhausted] = React.useState(false);

  // On each confirmed focused send, (re)arm the pending bubble + refetch burst.
  React.useEffect(() => {
    if (!isFocusedSend || !highlightBody) return;
    setPending({ jid: chatJid, body: highlightBody, sentAt: new Date().toISOString() });
    setPendingExhausted(false);
    // Immediate + scheduled out-of-band refetches so we don't wait on the 60s
    // poll and cover the sync worker's ~15s copy cadence across a few cycles.
    void queryClient.invalidateQueries({ queryKey });
    const timers = RECONCILE_RETRY_MS.map((delay, i) =>
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey });
        // After the final scheduled refetch, mark the schedule exhausted so an
        // as-yet-unreconciled bubble flips to sent-unconfirmed.
        if (i === RECONCILE_RETRY_MS.length - 1) setPendingExhausted(true);
      }, delay),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightNonce, chatJid]);

  // Drop the pending bubble the moment a matching synced row appears in a fetch.
  // Scoped to the pending's own chat: `fetched` is THIS open chat's history, so
  // only reconcile a pending that actually targets it (the component is reused
  // across chats, so `pending` may still hold chat A's send while chat B is open).
  React.useEffect(() => {
    if (pending && pending.jid === chatJid && isPendingReconciled(pending, fetched)) {
      setPending(null);
      setPendingExhausted(false);
    }
  }, [fetched, pending, chatJid]);

  // Merge the optimistic bubble into the rendered list while it's unreconciled —
  // but ONLY into the chat it targets, so a "sending…" from chat A never leaks
  // into chat B (the Conversation component is reused, not remounted, per chat).
  const messages = React.useMemo<ConversationMessage[]>(
    () => mergePendingForChat(fetched, pending, chatJid, pendingExhausted),
    [fetched, pending, chatJid, pendingExhausted],
  );

  const rows = React.useMemo(() => buildConversationRows(messages), [messages]);

  // Header name: macOS Contacts name over the route's resolved name / fallback.
  const contactsName = useContactName(chatJid);
  const routeName = data?.chatName ?? chatName;
  const headerName = pickContactName(contactsName, routeName, routeName);

  // The key of the message row to pulse-highlight: the LAST message whose body
  // matches the just-sent text (newest wins, incl. the pending bubble).
  const highlightKey = React.useMemo(() => {
    if (!highlightBody) return null;
    const target = normalizeBody(highlightBody);
    if (!target) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!;
      if (row.kind === "message" && row.message.fromMe && normalizeBody(row.message.body) === target)
        return row.key;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, highlightBody, highlightNonce]);

  // Keep the newest message in view: scroll to the bottom on load and whenever
  // the message count grows (e.g. a poll or the optimistic append adds a line).
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, chatJid]);

  return (
    <div style={contentRoot}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          padding: "6px 10px 6px 4px",
          borderBottom: hairline,
        }}
      >
        <BackButton onBack={onBack} />
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            color: SD_INK.base,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {headerName}
        </span>
      </div>

      <div ref={scrollRef} style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
        {isLoading ? (
          <p style={{ ...monoEyebrow, margin: "12px 0 0" }}>Loading…</p>
        ) : error ? (
          <p style={{ margin: "12px 0 0", color: SD_FUNCTIONAL.coral, fontSize: 12 }}>
            {error.message}
          </p>
        ) : rows.length === 0 ? (
          <p style={{ margin: "12px 0 0", color: SD_INK.faint, fontSize: 13 }}>
            No messages in this chat.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {rows.map((row) =>
              row.kind === "day" ? (
                <DaySeparator key={row.key} label={row.label} />
              ) : (
                <MessageBubble
                  key={row.key}
                  row={row}
                  highlighted={row.key === highlightKey}
                  highlightNonce={highlightNonce}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Back to the chat list. A verb, so it takes a quiet lucide glyph and ink —
 *  the accent is reserved for the unread state and is never chrome (DS §2). */
function BackButton({ onBack }: { onBack: () => void }): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Back to chats"
      onClick={onBack}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        display: "grid",
        placeItems: "center",
        width: MIN_TARGET_PX,
        height: MIN_TARGET_PX,
        flexShrink: 0,
        padding: 0,
        border: 0,
        borderRadius: SD_RADIUS.chrome,
        color: hovered ? SD_INK.base : SD_INK.dull,
        background: hovered ? SD_SURFACES.hover : "transparent",
        cursor: "pointer",
        transition: `color ${SD_DURATION.micro}ms ease-out, background-color ${SD_DURATION.micro}ms ease-out`,
      }}
    >
      <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** The day row: a mono eyebrow struck between two hairlines, which is also the
 *  rule separating one day's cluster of messages from the next. Replaces the
 *  old bordered pill — hairlines over borders. */
function DaySeparator({ label }: { label: string }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "14px 0 8px",
      }}
    >
      <span style={{ height: 1, flex: 1, background: SD_SURFACES.line }} />
      <span style={monoEyebrow}>{label}</span>
      <span style={{ height: 1, flex: 1, background: SD_SURFACES.line }} />
    </div>
  );
}

function MessageBubble({
  row,
  highlighted,
  highlightNonce,
}: {
  row: MessageRow;
  highlighted: boolean;
  highlightNonce?: number;
}): React.ReactElement {
  const { message, clusterStart, clusterEnd } = row;
  const [pulsing, setPulsing] = React.useState(false);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);

  // Cyan pulse when this bubble is the freshly-sent, focused message. Re-fires
  // when the focus request changes (highlightNonce) so re-focusing the same
  // chat re-plays the pulse. Also scrolls the bubble into view.
  React.useEffect(() => {
    if (!highlighted) return;
    setPulsing(true);
    bubbleRef.current?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setPulsing(false), 1600);
    return () => clearTimeout(t);
  }, [highlighted, highlightNonce]);

  const mine = message.fromMe;
  const pending = message.pending === true;
  // Sent, but not yet proven present in the synced history (reconcile retries
  // exhausted). Shown as a normal sent bubble — real timestamp, full opacity —
  // so it never hangs on "sending…" when the message actually went through.
  const unconfirmed = message.unconfirmed === true;
  // Tighter clustering: consecutive same-sender bubbles hug; new clusters get
  // more top gap. Only the last bubble of a run rounds its "tail" corner fully.
  const tailCorner = mine ? "borderBottomRightRadius" : "borderBottomLeftRadius";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
        marginTop: clusterStart ? 6 : 1,
        marginBottom: clusterEnd ? 2 : 0,
      }}
    >
      <div
        ref={bubbleRef}
        style={{
          maxWidth: "80%",
          padding: "6px 9px",
          borderRadius: SD_RADIUS.pillInset,
          [tailCorner]: clusterEnd ? SD_RADIUS.pillInset : 3,
          // Mine wears the chip's cyan tone (DS §10): the hue at 30% into the
          // line for the border, 15% into the box for the fill. Theirs is the
          // recessed input surface. The pulse moves the BORDER and an inset
          // hairline — never an outer glow ring (§16).
          border: `1px solid ${
            pulsing
              ? SD_ACCENT
              : mine
                ? `color-mix(in srgb, ${SD_ACCENT} 30%, ${SD_SURFACES.line})`
                : SD_SURFACES.line
          }`,
          color: SD_INK.base,
          background: mine
            ? `color-mix(in srgb, ${SD_ACCENT} 15%, ${SD_SURFACES.box})`
            : SD_SURFACES.input,
          boxShadow: pulsing
            ? `inset 0 0 0 1px color-mix(in srgb, ${SD_ACCENT} 55%, transparent)`
            : "none",
          opacity: pending ? 0.72 : 1,
          transition: `box-shadow ${SD_DURATION.micro}ms ease-out, border-color ${SD_DURATION.micro}ms ease-out, opacity ${SD_DURATION.micro}ms ease-out`,
        }}
      >
        {!mine && clusterStart && message.senderName ? (
          <div style={{ ...monoEyebrow, fontSize: 10, marginBottom: 3 }}>
            {message.senderName}
          </div>
        ) : null}
        <div style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {message.body ?? "Media message"}
        </div>
        <time
          style={{
            ...monoCaption,
            display: "block",
            marginTop: 3,
            fontSize: 9,
            textAlign: "right",
          }}
        >
          {pending
            ? "sending…"
            : unconfirmed
              ? `${timeLabel(message.sentAt)} · sent`
              : timeLabel(message.sentAt)}
        </time>
      </div>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

export default function WhatsAppWidget({ props }: WidgetContentProps): React.ReactElement {
  const focus = props as FocusChatProps;
  const [active, setActive] = React.useState<{ jid: string; name: string } | null>(null);

  // A focus-chat request (studio-action after a confirmed send) navigates into
  // that chat. focusAt is the re-trigger nonce so re-focusing the same chat
  // re-runs this effect (and the message pulse). Falls back to jid-change.
  React.useEffect(() => {
    if (focus.focusChatJid) {
      setActive({ jid: focus.focusChatJid, name: focus.focusChatName ?? focus.focusChatJid });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.focusChatJid, focus.focusAt]);

  if (active) {
    return (
      <Conversation
        chatJid={active.jid}
        chatName={active.name}
        highlightBody={
          focus.focusChatJid === active.jid ? focus.focusMessageBody : undefined
        }
        highlightNonce={focus.focusAt}
        onBack={() => setActive(null)}
      />
    );
  }
  return <ChatList onOpenChat={(jid, name) => setActive({ jid, name })} />;
}
