/**
 * process-sms.ts — what happens to an inbound text message after the webhook
 * has verified it and answered Twilio.
 *
 * Runs inside `after()`, detached from the HTTP response, so nothing here may
 * throw into the void: every outcome, including every reason a message went
 * UNANSWERED, is written to the jarvis_sms_events ledger. Silence with no row
 * is indistinguishable from a bug.
 *
 * THE ORDER OF THE GATES MATTERS
 *   1. Ledger insert (the replay lock)   — a Twilio retry stops here.
 *   2. Loop-breaker                      — never answer our own number.
 *   3. Allowlist                         — a filter, not authentication.
 *   4. User resolution                   — owner, then single-user fallback.
 *   5. The settings toggle               — checked BEFORE the turn, so a closed
 *                                          channel costs zero Anthropic calls.
 *   6. The turn.
 *
 * Steps 2 through 5 all cost nothing. Only step 6 spends money, which is why
 * every cheap rejection happens first.
 */

import { eq, sql } from "drizzle-orm";

import { OWNER_EMAIL } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { getMessagingSettings } from "@/lib/db/queries/messaging";
import { jarvisSmsEvents, users } from "@/lib/db/schema";
import { findSingleUserId } from "@/lib/jarvis/find-single-user";
import { runChannelTurn } from "@/lib/jarvis/run-channel-turn";
import { composeSmsReply } from "@/lib/jarvis/sms-receipt";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";
import { isAllowedSmsSender, isOwnSmsNumber, normalizePhoneNumber } from "@/lib/twilio/config";
import { sendSmsReply } from "@/lib/twilio/send";

/** Provenance label stamped on anything the executor creates from a text. */
export const SMS_DEVICE_LABEL = "SMS";

/**
 * How long a turn may run before the user gets an interim acknowledgement.
 *
 * A text message gives no typing indicator and no streaming, so a turn that
 * spends 40 seconds in a tool reads as "it ignored me". The watchdog sends one
 * short line and the real answer still follows.
 */
export const SMS_ACK_AFTER_MS = 20_000;

const ACK_LINE = "On it, sir. One moment.";

export interface InboundSms {
  /** Twilio's durable per-message id. The idempotency key. */
  messageSid: string;
  /** Sender, as Twilio reports it. */
  from: string;
  /** The number the message was sent TO (ours). */
  to: string;
  /** Message body; empty for a media-only MMS. */
  body: string;
  /** Number of media attachments (MMS). */
  mediaCount?: number;
}

export type ProcessSmsOutcome =
  | { status: "duplicate" }
  | { status: "ignored_sender" }
  | { status: "disabled" }
  /** turnId is null when the reply was a fixed notice rather than a turn. */
  | { status: "done"; turnId: string | null }
  | { status: "error"; error: string };

/** Record the terminal state of a ledger row. */
async function closeLedger(
  messageSid: string,
  fields: { status: string; error?: string | null; userId?: string | null; turnId?: string | null }
): Promise<void> {
  await db
    .update(jarvisSmsEvents)
    .set({
      status: fields.status,
      error: fields.error ?? null,
      ...(fields.userId !== undefined ? { userId: fields.userId } : {}),
      ...(fields.turnId !== undefined ? { turnId: fields.turnId } : {}),
      processedAt: sql`now()`,
    })
    .where(eq(jarvisSmsEvents.messageSid, messageSid))
    .catch((err: unknown) => {
      console.error("[twilio/process-sms] failed to close ledger row", err);
    });
}

/** Mirror the outcome onto the user row so /settings#messaging can show it. */
async function recordUserTelemetry(
  userId: string,
  status: string,
  error: string | null
): Promise<void> {
  await db
    .update(users)
    .set({
      smsJarvisLastReplyAt: new Date(),
      smsJarvisLastStatus: status,
      smsJarvisLastError: error,
    })
    .where(eq(users.id, userId))
    .catch((err: unknown) => {
      console.error("[twilio/process-sms] failed to record telemetry", err);
    });
}

/**
 * Resolve which account an inbound number speaks for.
 *
 * Three layers, in the order the brief sets: the allowlist has already filtered
 * the sender, so what remains is deciding WHOSE assistant answers. The owner
 * account is the answer in every real deployment; findSingleUserId is the
 * last-resort fallback for a single-user install whose owner email was never
 * configured. The phone number is deliberately NOT part of this: it is
 * spoofable, so it may filter but must never select an identity.
 */
async function resolveSmsUserId(): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, OWNER_EMAIL))
    .limit(1);
  if (rows[0]?.id) return rows[0].id;
  return findSingleUserId();
}

/**
 * Handle one inbound text message end to end.
 *
 * Never throws: every failure resolves to an outcome and a ledger row.
 */
export async function processInboundSms(input: InboundSms): Promise<ProcessSmsOutcome> {
  const from = normalizePhoneNumber(input.from) ?? input.from;
  const to = normalizePhoneNumber(input.to) ?? input.to;

  // 1. The replay lock. An empty return means this MessageSid was already
  //    accepted, so a Twilio retry costs nothing and cannot double-file.
  const [ledgerRow] = await db
    .insert(jarvisSmsEvents)
    .values({ messageSid: input.messageSid, fromNumber: from, toNumber: to, status: "received" })
    .onConflictDoNothing()
    .returning({ messageSid: jarvisSmsEvents.messageSid });
  if (!ledgerRow) return { status: "duplicate" };

  // 2. Loop-breaker. Asserted here rather than trusted to the transport: if an
  //    outbound reply were ever echoed back in (a misrouted Messaging Service,
  //    a copied webhook URL), JARVIS would answer itself indefinitely.
  if (isOwnSmsNumber(from)) {
    await closeLedger(input.messageSid, {
      status: "ignored_sender",
      error: "loopback: message originated from our own Twilio number",
    });
    return { status: "ignored_sender" };
  }

  // 3. The allowlist.
  if (!isAllowedSmsSender(from)) {
    await closeLedger(input.messageSid, {
      status: "ignored_sender",
      error: "sender is not in JARVIS_SMS_ALLOWED_SENDERS",
    });
    return { status: "ignored_sender" };
  }

  // 4. Whose assistant is this.
  const userId = await resolveSmsUserId();
  if (!userId) {
    const error = `no user to route to (owner ${OWNER_EMAIL} not found and more than one account exists)`;
    await closeLedger(input.messageSid, { status: "error", error });
    return { status: "error", error };
  }

  // 5. The settings gate, BEFORE the turn. Closed channel → no Anthropic call.
  const settings = await getMessagingSettings(userId);
  if (!settings.enabled) {
    await closeLedger(input.messageSid, {
      status: "disabled",
      error: "sms_jarvis_enabled is off; enable it in /settings#messaging",
      userId,
    });
    await recordUserTelemetry(userId, "disabled", null);
    return { status: "disabled" };
  }

  const mediaCount = input.mediaCount ?? 0;
  const body = input.body.trim();
  const channelNotes = [
    "This message arrived by SMS. Reply in plain text with no markdown, and keep it short enough to read on a phone.",
  ];
  if (mediaCount > 0) {
    channelNotes.push(
      `The sender attached ${mediaCount} media file${mediaCount === 1 ? "" : "s"}. You cannot open ${mediaCount === 1 ? "it" : "them"}; say so plainly if ${mediaCount === 1 ? "it matters" : "they matter"}.`
    );
  }

  // A media-only MMS has nothing to reason about. Answer honestly and stop
  // rather than sending an empty message to the model.
  if (!body) {
    const notice =
      mediaCount > 0
        ? "I received your attachment, sir, but I cannot read images yet. Send it as text and I will act on it."
        : "I received an empty message, sir.";
    const sent = await sendSmsReply({ to: from, body: notice });
    const error = sent.ok ? null : sent.error;
    await closeLedger(input.messageSid, {
      status: sent.ok ? "done" : "error",
      error,
      userId,
    });
    await recordUserTelemetry(userId, sent.ok ? "done" : "error", error);
    return sent.ok
      ? { status: "done", turnId: null }
      : { status: "error", error: error ?? "send failed" };
  }

  // 6. The turn. One watchdog ack so a slow tool never reads as silence. It is
  //    a single setTimeout, cleared on completion, so at most one extra message
  //    ever goes out per turn.
  const watchdog = setTimeout(() => {
    void sendSmsReply({ to: from, body: ACK_LINE }).then((r) => {
      if (!r.ok) console.error("[twilio/process-sms] interim ack failed", r.error);
    });
  }, SMS_ACK_AFTER_MS);

  try {
    const turn = await runChannelTurn({
      userId,
      text: body,
      deviceLabel: SMS_DEVICE_LABEL,
      inputModality: "text",
      channelNotes,
      // No streaming on a text channel: the reply is one finished message.
      isVoice: false,
    });

    if (turn.status === "error") {
      throw new Error(turn.errorMessage ?? "JARVIS turn failed");
    }

    // Prose AND receipt, not either/or. The old `prose || receipt` meant any
    // turn that produced a sentence dropped its receipt on the floor: "Loud
    // and clear, sir." with no mention of the task it had just filed. A text
    // message has no UI behind it to go check, so what changed is the part
    // that matters most — see lib/jarvis/sms-receipt.ts.
    const prose = stripSystemTags(turn.text ?? "").trim();
    const reply = composeSmsReply(prose, turn.actions);

    const sent = await sendSmsReply({ to: from, body: reply });
    if (!sent.ok) throw new Error(sent.error);

    await closeLedger(input.messageSid, { status: "done", userId, turnId: turn.turnId });
    await recordUserTelemetry(userId, "done", null);
    return { status: "done", turnId: turn.turnId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[twilio/process-sms] turn failed", err);
    await closeLedger(input.messageSid, { status: "error", error, userId });
    await recordUserTelemetry(userId, "error", error);
    // Tell the user something went wrong rather than leaving them staring at a
    // sent message with no reply. Best effort; a failed notice is only logged.
    const notice = await sendSmsReply({
      to: from,
      body: "Something went wrong on my end, sir. Try again in a moment.",
    });
    if (!notice.ok) console.error("[twilio/process-sms] failure notice failed", notice.error);
    return { status: "error", error };
  } finally {
    clearTimeout(watchdog);
  }
}
