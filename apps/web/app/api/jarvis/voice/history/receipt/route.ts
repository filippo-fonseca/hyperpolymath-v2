import type { NextRequest } from "next/server";

import { z } from "zod";

import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { jarvisTurns } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

/**
 * POST /api/jarvis/voice/history/receipt
 *
 * Records the TRUE terminal outcome of a desktop-gated action (today: a
 * WhatsApp send) into `jarvis_turns` so the very next voice turn can answer
 * "did you send it?" with grounded truth instead of a guess.
 *
 * Why this exists: desktop tool execution is fire-and-forget. The agent emits a
 * `send_message` action, the desktop confirm-gate holds it, the user confirms
 * aloud, and the bridge sends — but that success/failure NEVER reaches the
 * server. `buildRecentHistory` (the voice agent's cross-turn memory) reads
 * `jarvis_turns`, which only ever held the model's own prose, so the model
 * literally cannot know whether the send happened. It was left to waffle.
 *
 * The desktop now POSTs a receipt here the instant the bridge returns. We append
 * an assistant-kind turn whose `text_delta` is a terse system-style line; because
 * `buildRecentHistory` maps `kind === "assistant"` → an assistant message, the
 * next turn sees it as prior context and can state the outcome plainly. No
 * schema change: `jarvis_turns` already expresses this shape.
 *
 * Owner-gated via the same desktop bearer (hpd_...) as
 * /api/jarvis/voice/history/clear.
 */
const ReceiptSchema = z
  .object({
    channel: z.literal("whatsapp"),
    recipient: z.string().min(1),
    jid: z.string().optional().nullable(),
    text: z.string().min(1),
    success: z.boolean(),
    /** ISO 8601 delivery time; defaults to now if omitted or unparseable. */
    at: z.string().optional().nullable(),
  })
  .strict();

function receiptLine(input: z.infer<typeof ReceiptSchema>, at: Date): string {
  const who = input.jid?.trim()
    ? `${input.recipient} (${input.jid.trim()})`
    : input.recipient;
  const when = at.toISOString();
  // Body is quoted so a following "what did I say?" is also answerable.
  const body = input.text.length > 400 ? `${input.text.slice(0, 400)}…` : input.text;
  return input.success
    ? `[system receipt] WhatsApp message to ${who} delivered to transport at ${when}: "${body}"`
    : `[system receipt] WhatsApp message to ${who} FAILED to send at ${when} (not delivered): "${body}"`;
}

export async function POST(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;

  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid-json" }, { status: 400, headers: CORS });
  }

  const parsed = ReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid-body", issues: parsed.error.issues },
      { status: 400, headers: CORS },
    );
  }

  const atRaw = parsed.data.at ? new Date(parsed.data.at) : new Date();
  const at = Number.isNaN(atRaw.getTime()) ? new Date() : atRaw;
  const line = receiptLine(parsed.data, at);

  try {
    await db.insert(jarvisTurns).values({
      id: crypto.randomUUID(),
      userId,
      kind: "assistant",
      text: null,
      textDelta: line,
      status: "done",
      errorMessage: null,
      createdAt: at,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[voice/history/receipt] insert failed", err);
    return Response.json({ ok: false, error: "receipt-failed" }, { status: 500, headers: CORS });
  }

  return Response.json({ ok: true }, { status: 200, headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
