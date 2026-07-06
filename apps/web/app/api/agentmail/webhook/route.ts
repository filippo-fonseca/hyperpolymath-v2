import type { AgentMail } from "agentmail";
import { type NextRequest, after } from "next/server";
import { z } from "zod";

import { processAgentMailReceivedEvent } from "@/lib/agentmail/process-email";
import { verifySvixSignature } from "@/lib/agentmail/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RawWebhookSchema = z
  .object({
    eventType: z.string().optional(),
    event_type: z.string().optional(),
    eventId: z.string().optional(),
    event_id: z.string().optional(),
    message: z.record(z.string(), z.unknown()),
  })
  .passthrough();

function getString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function normalizeMessage(raw: Record<string, unknown>): AgentMail.Message {
  const inboxId = getString(raw, "inboxId", "inbox_id");
  const messageId = getString(raw, "messageId", "message_id");
  const threadId = getString(raw, "threadId", "thread_id");
  const from = getString(raw, "from", "from_");
  if (!inboxId || !messageId || !threadId || !from) {
    throw new Error("AgentMail webhook message is missing inboxId/messageId/threadId/from");
  }

  const timestamp = new Date(getString(raw, "timestamp") ?? Date.now());
  const updatedAt = new Date(getString(raw, "updatedAt", "updated_at") ?? Date.now());
  const createdAt = new Date(getString(raw, "createdAt", "created_at") ?? Date.now());

  return {
    ...raw,
    inboxId,
    messageId,
    threadId,
    from,
    labels: Array.isArray(raw.labels) ? (raw.labels as string[]) : [],
    timestamp,
    to: Array.isArray(raw.to) ? (raw.to as string[]) : [],
    subject: getString(raw, "subject"),
    preview: getString(raw, "preview"),
    text: getString(raw, "text"),
    html: getString(raw, "html"),
    extractedText: getString(raw, "extractedText", "extracted_text"),
    extractedHtml: getString(raw, "extractedHtml", "extracted_html"),
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    size: typeof raw.size === "number" ? raw.size : 0,
    updatedAt,
    createdAt,
  } as unknown as AgentMail.Message;
}

function shouldVerifyWebhook(): boolean {
  return process.env.AGENTMAIL_SKIP_WEBHOOK_VERIFICATION !== "true";
}

export async function POST(req: NextRequest): Promise<Response> {
  const payload = await req.text();
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (shouldVerifyWebhook()) {
    if (!secret) {
      return Response.json(
        { error: "AgentMail webhook secret is not configured" },
        { status: 500 }
      );
    }
    const ok = verifySvixSignature({
      payload,
      secret,
      svixId: req.headers.get("svix-id"),
      svixTimestamp: req.headers.get("svix-timestamp"),
      svixSignature: req.headers.get("svix-signature"),
    });
    if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: z.infer<typeof RawWebhookSchema>;
  try {
    parsed = RawWebhookSchema.parse(JSON.parse(payload));
  } catch (err) {
    return Response.json(
      {
        error: "Invalid AgentMail webhook payload",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  const eventType = parsed.eventType ?? parsed.event_type;
  const eventId = parsed.eventId ?? parsed.event_id;
  if (!eventType || !eventId) {
    return Response.json({ error: "Missing AgentMail event id/type" }, { status: 400 });
  }
  if (eventType !== "message.received") {
    return Response.json({ accepted: true, ignored: true });
  }

  let message: AgentMail.Message;
  try {
    message = normalizeMessage(parsed.message);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  after(async () => {
    try {
      await processAgentMailReceivedEvent({ eventId, eventType, message });
    } catch (err) {
      console.error("[agentmail/webhook] processing failed", err);
    }
  });

  return Response.json({ accepted: true });
}
