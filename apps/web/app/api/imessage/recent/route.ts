// GET /api/imessage/recent?since=<iso>
//
// Recent INCOMING iMessages for the notification announcer's watcher. Returns
// the newest not-from-me rows across all chats, optionally bounded to those
// strictly after a `since` ISO watermark, drawn from the ingested
// imessage_messages table (the same synced source the read_imessage tool and
// /api/imessage/resolve use). chat.db is TCC-protected and the desktop app
// lacks Full Disk Access, so the synced Postgres table — not a direct read —
// is the safe source here. It lags the sync worker's poll interval
// (~15s default), which the desktop watcher tolerates via its per-channel
// watermark + start-time floor.
//
// Auth mirrors /api/imessage/resolve exactly: device bearer identity + owner
// gate. Outgoing (fromMe) rows are excluded server-side so the watcher never
// announces the owner's own sends.

import type { NextRequest } from "next/server";

import { and, desc, eq, gt } from "drizzle-orm";

import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { imessageMessages } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

/** Hard cap on rows returned so a burst can never return an unbounded page. */
const RECENT_LIMIT = 40;

interface RecentImessage {
  chatJid: string;
  senderName: string;
  body: string | null;
  sentAt: string;
}

/**
 * GET /api/imessage/recent?since=2026-07-12T09:00:00.000Z
 *
 * → { messages: RecentImessage[] } — newest-first incoming iMessages, bounded
 *   to RECENT_LIMIT and (when `since` is a valid ISO date) to those strictly
 *   after it. `senderName` falls back to the raw handle, then a generic label,
 *   so the announcer always has something to voice. Never throws blind — a DB
 *   error returns 500 and the desktop watcher skips this tick.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;

  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  const sinceParam = req.nextUrl.searchParams.get("since")?.trim();
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  const since = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  try {
    const conditions = [
      eq(imessageMessages.userId, userId),
      eq(imessageMessages.fromMe, false),
    ];
    if (since) conditions.push(gt(imessageMessages.sentAt, since));

    const rows = await db
      .select({
        chatJid: imessageMessages.chatJid,
        chatName: imessageMessages.chatName,
        senderName: imessageMessages.senderName,
        sender: imessageMessages.sender,
        body: imessageMessages.body,
        sentAt: imessageMessages.sentAt,
      })
      .from(imessageMessages)
      .where(and(...conditions))
      .orderBy(desc(imessageMessages.sentAt))
      .limit(RECENT_LIMIT);

    const messages: RecentImessage[] = rows.map((r) => {
      const sentAt = r.sentAt instanceof Date ? r.sentAt.toISOString() : String(r.sentAt);
      const name =
        r.senderName?.trim() ||
        r.chatName?.trim() ||
        r.sender?.trim() ||
        "Someone";
      return { chatJid: r.chatJid, senderName: name, body: r.body, sentAt };
    });

    return Response.json({ messages }, { headers: CORS });
  } catch (err) {
    console.error("[imessage/recent] lookup failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS },
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
