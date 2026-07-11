"use client";

import { useQuery } from "@tanstack/react-query";
import { STUDIOLO } from "../../materials/tokens";
import { useStudioData } from "../../data/useStudioData";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tableKey } from "@/lib/realtime/query-keys";
import { fetchStudioWidget } from "./widget-fetch";

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
  const { userId } = useStudioData();
  useTableSubscription("whatsapp_messages", userId);
  const { data, error, isLoading } = useQuery({
    queryKey: tableKey("whatsapp_messages", userId),
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/whatsapp"),
  });
  const chats = data?.chats ?? [];
  const unreplied = chats.filter((chat) => chat.messages[0] && !chat.messages[0].fromMe).length;

  if (isLoading) return <div className="h-full animate-pulse opacity-20" style={{ background: STUDIOLO.moonlace }} />;
  if (error) return <p className="p-4 text-xs" style={{ color: STUDIOLO.emberAlarm }}>{error.message}</p>;
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider" style={{ color: STUDIOLO.moonlace }}>
        Recent chats
        {unreplied > 0 ? <span className="rounded-full px-2 py-0.5" style={{ color: STUDIOLO.nightwalnut, background: STUDIOLO.jarvisCyan }}>{unreplied} unreplied</span> : null}
      </div>
      {chats.length === 0 ? <p className="text-xs" style={{ color: STUDIOLO.moonlace }}>{data?.note ?? "No recent messages."}</p> : null}
      <div className="space-y-1.5">
        {chats.map((chat) => {
          const latest = chat.messages[0];
          const attention = latest && !latest.fromMe;
          return (
            <article
              key={chat.chatName}
              className="rounded-md border p-2"
              style={{
                borderColor: `color-mix(in srgb, ${attention ? STUDIOLO.jarvisCyan : STUDIOLO.brass} 24%, transparent)`,
                background: attention ? `color-mix(in srgb, ${STUDIOLO.jarvisCyan} 6%, transparent)` : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-medium">
                <span className="truncate">{chat.chatName}</span>
                <time className="shrink-0 font-mono text-[9px]" style={{ color: STUDIOLO.moonlace }}>
                  {latest ? new Date(latest.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
                </time>
              </div>
              <p className="mt-1 truncate text-[11px]" style={{ color: STUDIOLO.moonlace }}>{latest?.body ?? "Media message"}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
