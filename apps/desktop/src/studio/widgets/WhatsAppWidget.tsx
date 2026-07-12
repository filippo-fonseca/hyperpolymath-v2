import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { STUDIO_COLORS, STUDIO_MONO, STUDIOLO } from "../tokens";
import type { WidgetContentProps } from "../windows/catalog";
import { fetchStudioWidget } from "./widget-fetch";

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

function normalizeBody(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const uppercaseLabel: React.CSSProperties = {
  color: STUDIO_COLORS.muted,
  fontFamily: STUDIO_MONO,
  fontSize: 9,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
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
    return <div style={{ height: "100%", background: STUDIO_COLORS.surface }} />;
  }
  if (error) {
    return (
      <p style={{ padding: 16, color: STUDIO_COLORS.danger, fontSize: 12 }}>
        {error.message}
      </p>
    );
  }

  const chats = data?.chats ?? [];
  const attentionCount = chats.filter((c) => c.attention).length;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          ...uppercaseLabel,
        }}
      >
        Recent chats
        {attentionCount > 0 ? (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              color: STUDIO_COLORS.background,
              background: STUDIO_COLORS.accent,
            }}
          >
            {attentionCount} unreplied
          </span>
        ) : null}
      </div>
      {chats.length === 0 ? (
        <p style={{ color: STUDIO_COLORS.muted, fontSize: 12 }}>
          {data?.note ?? "No recent messages."}
        </p>
      ) : null}
      <div style={{ display: "grid", gap: 6 }}>
        {chats.map((chat) => (
          <button
            key={chat.chatJid}
            type="button"
            onClick={() => onOpenChat(chat.chatJid, chat.chatName)}
            style={{
              display: "block",
              width: "100%",
              minHeight: MIN_TARGET_PX,
              padding: 8,
              textAlign: "left",
              border: `1px solid ${chat.attention ? STUDIO_COLORS.accent : STUDIO_COLORS.rule}`,
              borderRadius: 6,
              color: STUDIO_COLORS.text,
              background: chat.attention
                ? `color-mix(in srgb, ${STUDIO_COLORS.accent} 6%, transparent)`
                : "transparent",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {chat.chatName}
              </span>
              <time
                style={{
                  flexShrink: 0,
                  color: STUDIO_COLORS.muted,
                  fontFamily: STUDIO_MONO,
                  fontSize: 9,
                }}
              >
                {timeLabel(chat.lastAt)}
              </time>
            </div>
            <p
              style={{
                margin: "4px 0 0",
                overflow: "hidden",
                color: STUDIO_COLORS.muted,
                fontSize: 11,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {chat.lastFromMe ? "You: " : ""}
              {chat.lastBody ?? "Media message"}
            </p>
          </button>
        ))}
      </div>
    </div>
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
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "whatsapp", "chat", chatJid],
    queryFn: () =>
      fetchStudioWidget<ChatHistoryReceipt>(
        `/api/studio/whatsapp?chat=${encodeURIComponent(chatJid)}`,
      ),
    refetchInterval: hidden ? false : ACTIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const messages = data?.messages ?? [];

  // The index of the message to pulse-highlight: the LAST message whose body
  // matches the just-sent text (newest wins). Recomputed when the highlight
  // request changes (highlightNonce) or new messages arrive.
  const highlightIndex = React.useMemo(() => {
    if (!highlightBody) return -1;
    const target = normalizeBody(highlightBody);
    if (!target) return -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.fromMe && normalizeBody(messages[i]!.body) === target) return i;
    }
    return -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, highlightBody, highlightNonce]);

  // Keep the newest message in view: scroll to the bottom on load and whenever
  // the message count grows (e.g. a poll picks up the just-sent line).
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, chatJid]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          padding: "8px 10px",
          borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
        }}
      >
        <button
          type="button"
          aria-label="Back to chats"
          onClick={onBack}
          style={{
            display: "grid",
            placeItems: "center",
            width: MIN_TARGET_PX,
            height: MIN_TARGET_PX,
            flexShrink: 0,
            padding: 0,
            border: 0,
            borderRadius: 6,
            color: STUDIO_COLORS.accent,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            fontSize: 13,
            fontWeight: 600,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {data?.chatName ?? chatName}
        </span>
      </div>

      <div ref={scrollRef} style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: 12 }}>
        {isLoading ? (
          <p style={{ ...uppercaseLabel }}>Loading…</p>
        ) : error ? (
          <p style={{ color: STUDIO_COLORS.danger, fontSize: 12 }}>{error.message}</p>
        ) : messages.length === 0 ? (
          <p style={{ color: STUDIO_COLORS.muted, fontSize: 12 }}>No messages in this chat.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {messages.map((m, i) => (
              <MessageBubble
                key={`${m.sentAt}:${i}`}
                message={m}
                highlighted={i === highlightIndex}
                highlightNonce={highlightNonce}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  highlighted,
  highlightNonce,
}: {
  message: HistoryMessage;
  highlighted: boolean;
  highlightNonce?: number;
}): React.ReactElement {
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
  return (
    <div
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        ref={bubbleRef}
        style={{
          maxWidth: "80%",
          padding: "6px 9px",
          borderRadius: 10,
          border: `1px solid ${
            pulsing ? STUDIOLO.fireflyCyan : mine ? STUDIO_COLORS.accent : STUDIO_COLORS.rule
          }`,
          color: STUDIO_COLORS.text,
          background: mine
            ? `color-mix(in srgb, ${STUDIO_COLORS.accent} 14%, transparent)`
            : `color-mix(in srgb, ${STUDIO_COLORS.surface} 92%, transparent)`,
          boxShadow: pulsing
            ? `0 0 0 2px color-mix(in srgb, ${STUDIOLO.fireflyCyan} 55%, transparent)`
            : "none",
          transition: "box-shadow 260ms ease, border-color 260ms ease",
        }}
      >
        {!mine && message.senderName ? (
          <div
            style={{
              marginBottom: 2,
              color: STUDIO_COLORS.accent,
              fontSize: 9,
              fontWeight: 600,
            }}
          >
            {message.senderName}
          </div>
        ) : null}
        <div style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {message.body ?? "Media message"}
        </div>
        <time
          style={{
            display: "block",
            marginTop: 2,
            color: STUDIO_COLORS.muted,
            fontFamily: STUDIO_MONO,
            fontSize: 8,
            textAlign: "right",
          }}
        >
          {timeLabel(message.sentAt)}
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
