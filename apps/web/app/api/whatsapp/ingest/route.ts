// POST /api/whatsapp/ingest
//
// Authed ingest endpoint for the local WhatsApp sync worker (see
// tools/whatsapp-sync/sync.mjs). The worker reads new rows out of the local
// lharries/whatsapp-mcp Go bridge (whatsmeow → SQLite) and POSTs batches
// here; we upsert them into whatsapp_messages, keyed on (user_id, chat_jid,
// external_id) so replays are safe.
//
// Auth mirrors /api/jarvis/voice/transcript's desktop-bearer path exactly —
// same `Authorization: Bearer hpd_...` per-device token, validated via
// validateDesktopBearerIdentity. This gives multi-device readiness while
// keeping the single-user personal deployment unchanged.
//
// The read_whatsapp tool (server-side, runs inside JARVIS turns) queries the
// same table, so once messages land here they are immediately available to
// the agent + daily briefings with zero mid-turn desktop round-trip.

import type { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { whatsappMessages } from "@/lib/db/schema";
import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap batch size — the sync worker paginates locally; anything higher and the
// worker should chunk. 500 is comfortable for a nightly catch-up on a device
// that's been offline for a while without blowing the request body.
const MAX_BATCH = 500;

const IngestMessageSchema = z
  .object({
    externalId: z.string().min(1),
    chatJid: z.string().min(1),
    chatName: z.string().optional().nullable(),
    sender: z.string().optional().nullable(),
    senderName: z.string().optional().nullable(),
    fromMe: z.boolean(),
    body: z.string().optional().nullable(),
    /** ISO 8601 timestamp; the worker converts the bridge's timestamp column. */
    sentAt: z.string().min(1),
  })
  .strict();

const IngestBodySchema = z
  .object({
    messages: z.array(IngestMessageSchema).max(MAX_BATCH),
  })
  .strict();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const parsed = IngestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400, headers: CORS },
    );
  }

  const { messages } = parsed.data;
  if (messages.length === 0) {
    return Response.json({ inserted: 0 }, { headers: CORS });
  }

  const rows = messages.map((m) => {
    // sentAt arrives as an ISO string from the worker; Drizzle's timestamp
    // column takes a Date. Reject anything unparseable so bad worker payloads
    // fail loudly rather than being silently dropped.
    const parsedDate = new Date(m.sentAt);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid sentAt: ${m.sentAt}`);
    }
    return {
      userId: identity.userId,
      externalId: m.externalId,
      chatJid: m.chatJid,
      chatName: m.chatName ?? null,
      sender: m.sender ?? null,
      senderName: m.senderName ?? null,
      fromMe: m.fromMe,
      body: m.body ?? null,
      sentAt: parsedDate,
    };
  });

  try {
    // onConflictDoNothing on the (userId, chatJid, externalId) unique index —
    // replays after a crash just no-op. We could measure the exact `inserted`
    // count via RETURNING, but for the worker's purposes the batch size is a
    // good-enough progress signal and cheaper to return.
    const result = await db
      .insert(whatsappMessages)
      .values(rows)
      .onConflictDoNothing({
        target: [
          whatsappMessages.userId,
          whatsappMessages.chatJid,
          whatsappMessages.externalId,
        ],
      })
      .returning({ id: whatsappMessages.id });
    return Response.json({ inserted: result.length, received: rows.length }, { headers: CORS });
  } catch (err) {
    // Bad date, DB down, FK broken (rare — the token maps to a real user).
    // Log and return 500; the worker will retry the same batch on next tick
    // (idempotent thanks to onConflictDoNothing).
    // eslint-disable-next-line no-console
    console.error("[whatsapp/ingest] insert failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS },
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
