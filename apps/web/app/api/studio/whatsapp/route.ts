import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { whatsappMessages } from "@/lib/db/schema";
import { studioExecutorContext } from "../_executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The WhatsApp Studio widget is a real client: a chat list (mode `list=chats`)
// and a per-chat conversation history (mode `chat=<jid>`). Both read the synced
// `whatsapp_messages` Postgres table (populated by the local sync worker) — the
// same source the server-side `read_whatsapp` tool uses.
//
// DATA-PATH DECISION: the widget fetches THIS web route rather than the bridge
// HTTP API on :8080. The whatsmeow bridge exposes only /api/health, /api/qr,
// /api/send, /api/logout — it has NO /api/chats or /api/messages endpoint
// (verified: both 404 on a live bridge). The synced Postgres table is the
// canonical, already-plumbed source (the widget already fetched this route for
// its legacy grouped view), so extending it with list/chat modes is the
// least-plumbing path. No new bridge endpoint, no desktop DB access.

const CHAT_LIST_LIMIT = 24;
const HISTORY_LIMIT = 50;

interface ChatListItem {
  chatJid: string;
  chatName: string;
  lastBody: string | null;
  lastFromMe: boolean;
  lastAt: string;
  /** Crude unread-ish signal: the latest message is NOT from the owner.
   *  whatsmeow's marked-unread state is not synced into Postgres, so this
   *  "awaiting your reply" heuristic is the v1 unread badge. */
  attention: boolean;
}

interface HistoryMessage {
  senderName: string | null;
  fromMe: boolean;
  body: string | null;
  sentAt: string;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Prettify the phone number out of an individual chat JID for display:
 *  `12036068566@s.whatsapp.net` → `+1 203 606 8566`. Best-effort grouping
 *  (country-code + area + rest for NANP-length numbers); otherwise a single
 *  `+<digits>` block. Non-`@s.whatsapp.net` inputs (e.g. `@lid`) fall back to
 *  the bare digits with a leading `+`. */
function prettifyPhoneJid(jid: string): string {
  const local = jid.split("@")[0] ?? jid;
  const digits = local.replace(/\D/g, "");
  if (!digits) return jid;
  // NANP (+1 NXX NXX XXXX): render as +1 AAA BBB CCCC.
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return `+${digits}`;
}

/** Resolve a human display name for a chat, NEVER leaking a raw
 *  `@s.whatsapp.net` / `@lid` JID. Priority:
 *   1. a synced `chatName` (group subject, or contact name the sync worker
 *      resolved from whatsmeow_contacts),
 *   2. a synced `senderName` for individual chats (again contact-resolved),
 *   3. group JIDs (`@g.us`) with no subject → a generic "Group chat" label,
 *   4. individual JIDs → the prettified phone number. */
function resolveChatName(
  chatJid: string,
  chatName: string | null | undefined,
  senderName: string | null | undefined,
): string {
  const trimmedChat = chatName?.trim();
  if (trimmedChat) return trimmedChat;
  const trimmedSender = senderName?.trim();
  // A senderName that is itself just the raw JID is no better than the jid —
  // reject it so we fall through to the prettified number.
  if (trimmedSender && trimmedSender !== chatJid && !trimmedSender.includes("@")) {
    return trimmedSender;
  }
  if (chatJid.endsWith("@g.us")) return "Group chat";
  return prettifyPhoneJid(chatJid);
}

/** Chat list: latest N chats by most-recent message time, with a preview of
 *  that message and an "attention" (awaiting-reply) flag. Ordering is by recency
 *  because whatsmeow's true unread state isn't synced — see ChatListItem. */
async function chatList(userId: string): Promise<Response> {
  // Pull a bounded window of recent rows (newest first) and fold to one entry
  // per chat, keeping the first (latest) row seen for each. Bounded so a single
  // busy chat can't starve the fold; ample for CHAT_LIST_LIMIT distinct chats.
  const rows = await db
    .select({
      chatJid: whatsappMessages.chatJid,
      chatName: whatsappMessages.chatName,
      senderName: whatsappMessages.senderName,
      fromMe: whatsappMessages.fromMe,
      body: whatsappMessages.body,
      sentAt: whatsappMessages.sentAt,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.userId, userId))
    .orderBy(desc(whatsappMessages.sentAt))
    .limit(400);

  const seen = new Map<string, ChatListItem>();
  for (const r of rows) {
    if (seen.has(r.chatJid)) continue;
    seen.set(r.chatJid, {
      chatJid: r.chatJid,
      chatName: resolveChatName(r.chatJid, r.chatName, r.senderName),
      lastBody: r.body,
      lastFromMe: r.fromMe,
      lastAt: toIso(r.sentAt),
      attention: !r.fromMe,
    });
    if (seen.size >= CHAT_LIST_LIMIT) break;
  }

  const chats = Array.from(seen.values());
  return Response.json({
    ok: true,
    id: `whatsapp_chats:${chats.length}`,
    receipt: {
      mode: "chats",
      chats,
      totalCount: chats.length,
      ...(chats.length === 0
        ? {
            note: "No synced WhatsApp messages yet — is the bridge + sync worker running?",
          }
        : {}),
    },
  });
}

/** Conversation history: last HISTORY_LIMIT messages for one chat jid, returned
 *  oldest-first so the widget can render top-to-bottom and scroll to the newest
 *  at the bottom. `fromMe` drives the bubble side. */
async function chatHistory(userId: string, chatJid: string): Promise<Response> {
  const rows = await db
    .select({
      chatName: whatsappMessages.chatName,
      senderName: whatsappMessages.senderName,
      fromMe: whatsappMessages.fromMe,
      body: whatsappMessages.body,
      sentAt: whatsappMessages.sentAt,
    })
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.userId, userId), eq(whatsappMessages.chatJid, chatJid)))
    .orderBy(desc(whatsappMessages.sentAt))
    .limit(HISTORY_LIMIT);

  // Rows arrive newest-first (bounded to HISTORY_LIMIT); reverse to oldest-first
  // for natural top-to-bottom render.
  const ordered = rows.slice().reverse();
  const messages: HistoryMessage[] = ordered.map((r) => ({
    senderName: r.senderName,
    fromMe: r.fromMe,
    body: r.body,
    sentAt: toIso(r.sentAt),
  }));
  const chatName = resolveChatName(
    chatJid,
    ordered.find((r) => r.chatName?.trim())?.chatName ?? null,
    ordered.find((r) => r.senderName?.trim() && !r.fromMe)?.senderName ?? null,
  );

  return Response.json({
    ok: true,
    id: `whatsapp_chat:${chatJid}:${messages.length}`,
    receipt: { mode: "chat", chatJid, chatName, messages },
  });
}

export async function GET(request: Request): Promise<Response> {
  const auth = await studioExecutorContext(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const chatJid = url.searchParams.get("chat");
  const list = url.searchParams.get("list");

  try {
    if (chatJid && chatJid.trim()) {
      return await chatHistory(auth.ctx.userId, chatJid.trim());
    }
    if (list === "chats") {
      return await chatList(auth.ctx.userId);
    }
    // Default mode is the chat list — the widget's landing view.
    return await chatList(auth.ctx.userId);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
