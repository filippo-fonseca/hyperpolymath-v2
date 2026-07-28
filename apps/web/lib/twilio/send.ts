/**
 * send.ts — outbound SMS over the Twilio REST API.
 *
 * One authenticated form POST per message. Written against `fetch` rather than
 * the Twilio SDK for the same reason signature.ts is: the whole outbound need
 * is a single documented endpoint, and the SDK would be a large dependency (and
 * a shared lockfile edit) for it.
 *
 * Never throws. A send failure resolves with `ok: false` and a reason, so the
 * inbound processor can record it in the ledger instead of dying inside
 * `after()` where nothing would ever see the stack trace.
 */

import {
  getTwilioCredentials,
  isSmsDryRun,
  normalizePhoneNumber,
  type TwilioEnv,
} from "@/lib/twilio/config";
import { splitSmsSegments, SMS_SEGMENT_LIMIT } from "@/lib/twilio/split-message";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export type SendSmsResult =
  | { ok: true; sids: string[]; dryRun: boolean }
  | { ok: false; error: string };

/** Send one message. Prefer `sendSmsReply` for assistant output. */
async function sendOne(
  to: string,
  body: string,
  e?: TwilioEnv,
): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const creds = getTwilioCredentials(e);
  if (!creds) {
    return {
      ok: false,
      error:
        "Twilio is not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and one of TWILIO_MESSAGING_SERVICE_SID / TWILIO_FROM_NUMBER)",
    };
  }

  if (isSmsDryRun(e)) {
    // Exercised end to end without billing: the whole inbound path runs, the
    // ledger is written, and only the carrier hop is stubbed.
    console.info(`[twilio/send] DRY RUN → ${to}: ${body.slice(0, 120)}`);
    return { ok: true, sid: `DRYRUN-${crypto.randomUUID()}` };
  }

  const form = new URLSearchParams({ To: to, Body: body });
  if ("messagingServiceSid" in creds.from) {
    form.set("MessagingServiceSid", creds.from.messagingServiceSid);
  } else {
    form.set("From", creds.from.phoneNumber);
  }

  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${TWILIO_API_BASE}/Accounts/${creds.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok) {
    // Twilio returns a JSON error envelope; the plain text is a useful fallback
    // when it does not (a proxy 502, say).
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `Twilio send failed (${res.status}): ${detail.slice(0, 300)}` };
  }

  const payload = (await res.json().catch(() => null)) as { sid?: string } | null;
  return { ok: true, sid: payload?.sid ?? "" };
}

/**
 * Send an assistant reply, split into as few messages as the length allows.
 *
 * Segments go out sequentially, each awaited, so they arrive in the order they
 * were written. The first failure stops the run and reports it rather than
 * leaving a half-sent reply racing behind an error.
 */
export async function sendSmsReply(
  input: { to: string; body: string; limit?: number },
  e?: TwilioEnv,
): Promise<SendSmsResult> {
  const to = normalizePhoneNumber(input.to, e);
  if (!to) return { ok: false, error: `Unroutable destination number: ${input.to}` };

  const segments = splitSmsSegments(input.body, input.limit ?? SMS_SEGMENT_LIMIT);
  if (segments.length === 0) return { ok: false, error: "Refusing to send an empty message" };

  const sids: string[] = [];
  for (const segment of segments) {
    const result = await sendOne(to, segment, e);
    if (!result.ok) return { ok: false, error: result.error };
    sids.push(result.sid);
  }
  return { ok: true, sids, dryRun: isSmsDryRun(e) };
}
