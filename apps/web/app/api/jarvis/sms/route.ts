/**
 * POST /api/jarvis/sms — inbound Twilio SMS/MMS webhook (issue #352, D6).
 *
 * The transport edge, and nothing else. Verify, acknowledge, hand off:
 *
 *   1. Read the body RAW, before any parse. The signature covers the exact
 *      bytes Twilio sent, so parsing first would make verification meaningless.
 *   2. Verify X-Twilio-Signature. FAIL CLOSED when the secret is missing: a
 *      500, never a 200, because an unverified webhook that answers cheerfully
 *      is an open door to anyone who learns the URL.
 *   3. Answer immediately and run the turn in `after()`. Twilio's webhook
 *      timeout is far shorter than a JARVIS turn with tools, so an inline turn
 *      would be retried mid-flight. Same shape as the AgentMail webhook.
 *
 * Everything downstream (idempotency, allowlist, the settings gate, the turn,
 * the reply) lives in lib/twilio/process-sms.ts.
 */

import { type NextRequest, after } from "next/server";

import { processInboundSms } from "@/lib/twilio/process-sms";
import { shouldRespondWithTwiml, shouldVerifyTwilioSignature } from "@/lib/twilio/config";
import {
  parseTwilioFormBody,
  resolveTwilioWebhookUrl,
  verifyTwilioSignature,
} from "@/lib/twilio/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An empty TwiML document: "received, send nothing back inline". */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Twilio expects TwiML from a messaging webhook and logs a content-type warning
 * for anything else. We reply out of band over the REST API rather than
 * inline, so the JSON envelope is the more useful default for callers and
 * tests; set JARVIS_SMS_RESPONSE_TWIML=true to silence the Twilio-side warning.
 */
function accepted(extra?: Record<string, unknown>): Response {
  if (shouldRespondWithTwiml()) {
    return new Response(EMPTY_TWIML, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
  return Response.json({ accepted: true, ...extra });
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (shouldVerifyTwilioSignature()) {
    if (!authToken) {
      return Response.json({ error: "Twilio auth token is not configured" }, { status: 500 });
    }
    const ok = verifyTwilioSignature({
      authToken,
      signature: req.headers.get("x-twilio-signature"),
      url: resolveTwilioWebhookUrl({
        requestUrl: req.url,
        headers: req.headers,
        configuredUrl: process.env.TWILIO_WEBHOOK_URL,
      }),
      params: parseTwilioFormBody(rawBody),
    });
    if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = parseTwilioFormBody(rawBody);
  const messageSid = params.MessageSid || params.SmsMessageSid || params.SmsSid;
  const from = params.From;
  const to = params.To;
  if (!messageSid || !from || !to) {
    return Response.json(
      { error: "Missing MessageSid/From/To in the Twilio payload" },
      { status: 400 },
    );
  }

  const mediaCount = Number.parseInt(params.NumMedia ?? "0", 10);

  after(async () => {
    try {
      await processInboundSms({
        messageSid,
        from,
        to,
        body: params.Body ?? "",
        mediaCount: Number.isFinite(mediaCount) ? mediaCount : 0,
      });
    } catch (err) {
      // processInboundSms is written not to throw; this is the last net so a
      // surprise never becomes an unhandled rejection in the background task.
      console.error("[jarvis/sms] processing failed", err);
    }
  });

  return accepted({ messageSid });
}
