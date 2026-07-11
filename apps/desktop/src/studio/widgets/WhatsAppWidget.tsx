import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { fetchStudioWidget } from "./widget-fetch";

// MAJOR-5 — Widget is refetched every ACTIVE_POLL_MS while the HUD is
// visible. When `document.hidden` (HUD stowed, workspace switch, machine
// asleep), polling pauses entirely — we still refetch on window focus so
// the "back at desk" refresh works. The Realtime-invalidation pattern
// (per CLAUDE.md "Realtime as invalidation signal") is the eventual home,
// but a per-user Realtime channel is a bigger change; this cuts the
// unconditional pinning without that scope.
const ACTIVE_POLL_MS = 60_000;

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

interface Message {
  senderName: string | null;
  fromMe: boolean;
  body: string | null;
  sentAt: string;
}

interface Chat {
  chatName: string;
  messages: Message[];
}

interface Receipt extends Record<string, unknown> {
  chats: Chat[];
  totalCount: number;
  note?: string;
}

export default function WhatsAppWidget(): React.ReactElement {
  // SEAM: the desktop realtime subscription lands with the shell data bridge.
  // MAJOR-5 — pause polling entirely when the HUD is hidden; refetch on
  // focus for the "back at desk" case.
  const hidden = useDocumentHidden();
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "whatsapp"],
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/whatsapp"),
    refetchInterval: hidden ? false : ACTIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const chats = data?.chats ?? [];
  const unreplied = chats.filter(
    (chat) => chat.messages[0] && !chat.messages[0].fromMe,
  ).length;

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
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          color: STUDIO_COLORS.muted,
          fontFamily: STUDIO_MONO,
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Recent chats
        {unreplied > 0 ? (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              color: STUDIO_COLORS.background,
              background: STUDIO_COLORS.accent,
            }}
          >
            {unreplied} unreplied
          </span>
        ) : null}
      </div>
      {chats.length === 0 ? (
        <p style={{ color: STUDIO_COLORS.muted, fontSize: 12 }}>
          {data?.note ?? "No recent messages."}
        </p>
      ) : null}
      <div style={{ display: "grid", gap: 6 }}>
        {chats.map((chat) => {
          const latest = chat.messages[0];
          const attention = latest && !latest.fromMe;
          return (
            <article
              key={chat.chatName}
              style={{
                padding: 8,
                border: `1px solid ${attention ? STUDIO_COLORS.accent : STUDIO_COLORS.rule}`,
                borderRadius: 6,
                background: attention
                  ? `color-mix(in srgb, ${STUDIO_COLORS.accent} 6%, transparent)`
                  : undefined,
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
                  {latest
                    ? new Date(latest.sentAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : ""}
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
                {latest?.body ?? "Media message"}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
