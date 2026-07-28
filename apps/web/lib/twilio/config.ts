/**
 * config.ts — environment surface and phone-number handling for the Twilio
 * SMS/MMS channel (issue #352, decision D6).
 *
 * Everything env-shaped lives here so the webhook, the sender and the tests all
 * agree on one set of names, and so a missing secret is a single obvious
 * failure rather than four scattered `process.env` reads.
 *
 * ENV
 *   TWILIO_ACCOUNT_SID              account SID, for the REST send.
 *   TWILIO_AUTH_TOKEN               signing secret. Both verifies inbound
 *                                   webhooks and authenticates outbound sends.
 *   TWILIO_FROM_NUMBER              the E.164 number JARVIS replies from.
 *   TWILIO_MESSAGING_SERVICE_SID    optional; preferred over FROM_NUMBER when
 *                                   set (Twilio picks the number from the pool).
 *   TWILIO_WEBHOOK_URL              optional absolute URL override used when
 *                                   rebuilding the signed string. Set it when
 *                                   the public URL Twilio calls differs from
 *                                   what the proxy headers reconstruct.
 *   JARVIS_SMS_ALLOWED_SENDERS      comma-separated E.164 allowlist. Defaults
 *                                   to JARVIS_SMS_OWNER_NUMBER alone.
 *   JARVIS_SMS_OWNER_NUMBER         the owner's own handset. Convenience alias
 *                                   so the common case needs one variable.
 *   JARVIS_SMS_DEFAULT_COUNTRY_CODE dial prefix applied to a bare national
 *                                   number during normalization. Default "+1".
 *   JARVIS_SMS_SKIP_SIGNATURE_VERIFICATION
 *                                   test-only escape hatch, mirroring
 *                                   AGENTMAIL_SKIP_WEBHOOK_VERIFICATION.
 *   JARVIS_SMS_DRY_RUN              when "true", outbound sends are logged
 *                                   instead of billed. Lets the whole inbound
 *                                   path be exercised end to end for free.
 *   JARVIS_SMS_RESPONSE_TWIML       when "true", the webhook answers with an
 *                                   empty TwiML document instead of JSON.
 */

/** Environment slice this module reads; injectable so tests stay hermetic. */
export interface TwilioEnv {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  TWILIO_WEBHOOK_URL?: string;
  JARVIS_SMS_ALLOWED_SENDERS?: string;
  JARVIS_SMS_OWNER_NUMBER?: string;
  JARVIS_SMS_DEFAULT_COUNTRY_CODE?: string;
  JARVIS_SMS_SKIP_SIGNATURE_VERIFICATION?: string;
  JARVIS_SMS_DRY_RUN?: string;
  JARVIS_SMS_RESPONSE_TWIML?: string;
}

function env(e?: TwilioEnv): TwilioEnv {
  return e ?? (process.env as TwilioEnv);
}

/**
 * Normalize a phone number to E.164 ("+" followed by digits only).
 *
 * Handles the shapes a human actually types into a settings field: spaces,
 * dashes, parentheses, a leading "00" international prefix, and a bare national
 * number that needs the default country code. Returns null when nothing
 * plausible is left, so a malformed allowlist entry drops out rather than
 * matching everything.
 *
 * This is a NORMALIZER, not a validator: it does not know which prefixes are
 * real. It exists so "+1 (203) 555-0148" and "2035550148" compare equal.
 */
export function normalizePhoneNumber(
  value: string | null | undefined,
  e?: TwilioEnv,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) return `+${digits}`;
  // "00" is the ITU international access prefix; strip it and treat the rest
  // as already carrying its country code.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return digits ? `+${digits}` : null;
  }

  const cc = (env(e).JARVIS_SMS_DEFAULT_COUNTRY_CODE ?? "+1").replace(/\D/g, "");
  // Already long enough to carry its own country code, and it starts with the
  // default one — treat it as international rather than double-prefixing.
  if (cc && digits.startsWith(cc) && digits.length > 10) return `+${digits}`;
  return `+${cc}${digits}`;
}

/** The owner's own handset, normalized. Null when unconfigured. */
export function getSmsOwnerNumber(e?: TwilioEnv): string | null {
  return normalizePhoneNumber(env(e).JARVIS_SMS_OWNER_NUMBER, e);
}

/**
 * The set of senders whose messages are processed at all.
 *
 * Mirrors getAllowedAgentMailSenders (lib/agentmail/webhook.ts:19-36). This is
 * a FILTER, not authentication: SMS sender ids are spoofable, so the Twilio
 * request signature is what proves a message really came from Twilio, and the
 * allowlist is what stops a stranger who reaches the number from driving the
 * assistant. Both must hold.
 *
 * Defaults to the owner's own number alone. An empty set means the channel
 * accepts nobody, which is the correct closed default when nothing is
 * configured.
 */
export function getAllowedSmsSenders(e?: TwilioEnv): Set<string> {
  const configured = env(e)
    .JARVIS_SMS_ALLOWED_SENDERS?.split(",")
    .map((v) => normalizePhoneNumber(v, e))
    .filter((v): v is string => Boolean(v));
  if (configured?.length) return new Set(configured);
  const owner = getSmsOwnerNumber(e);
  return new Set(owner ? [owner] : []);
}

/** True when `from` is allowed to drive JARVIS over SMS. */
export function isAllowedSmsSender(from: string | null | undefined, e?: TwilioEnv): boolean {
  const normalized = normalizePhoneNumber(from, e);
  return Boolean(normalized && getAllowedSmsSenders(e).has(normalized));
}

/**
 * True when `from` is our OWN Twilio number.
 *
 * The loop-breaker. If an outbound reply were ever echoed back into the inbound
 * webhook (a misconfigured Messaging Service, a carrier loop, a copied webhook
 * URL), JARVIS would answer itself forever. We assert this in the ledger rather
 * than trusting the transport not to do it.
 */
export function isOwnSmsNumber(from: string | null | undefined, e?: TwilioEnv): boolean {
  const normalized = normalizePhoneNumber(from, e);
  const own = normalizePhoneNumber(env(e).TWILIO_FROM_NUMBER, e);
  return Boolean(normalized && own && normalized === own);
}

/** Test-only escape hatch, mirroring AGENTMAIL_SKIP_WEBHOOK_VERIFICATION. */
export function shouldVerifyTwilioSignature(e?: TwilioEnv): boolean {
  return env(e).JARVIS_SMS_SKIP_SIGNATURE_VERIFICATION !== "true";
}

/** When true, outbound sends are logged rather than billed. */
export function isSmsDryRun(e?: TwilioEnv): boolean {
  return env(e).JARVIS_SMS_DRY_RUN === "true";
}

/** When true, the webhook answers with empty TwiML instead of a JSON envelope. */
export function shouldRespondWithTwiml(e?: TwilioEnv): boolean {
  return env(e).JARVIS_SMS_RESPONSE_TWIML === "true";
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  /** Exactly one of these is set; messagingServiceSid wins when both are. */
  from: { messagingServiceSid: string } | { phoneNumber: string };
}

/**
 * Resolve the credentials needed to SEND. Returns null (never throws, never
 * partially-configured) when anything required is missing, so the caller can
 * record a precise ledger error instead of blowing up inside `after()`.
 */
export function getTwilioCredentials(e?: TwilioEnv): TwilioCredentials | null {
  const cfg = env(e);
  const accountSid = cfg.TWILIO_ACCOUNT_SID?.trim();
  const authToken = cfg.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;

  const serviceSid = cfg.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (serviceSid) {
    return { accountSid, authToken, from: { messagingServiceSid: serviceSid } };
  }
  const phoneNumber = normalizePhoneNumber(cfg.TWILIO_FROM_NUMBER, e);
  if (!phoneNumber) return null;
  return { accountSid, authToken, from: { phoneNumber } };
}
