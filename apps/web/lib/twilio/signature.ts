/**
 * signature.ts — Twilio webhook request verification.
 *
 * This is the ONLY thing that proves an inbound message really came from
 * Twilio. The `From` number does not: SMS sender ids are spoofable, so anyone
 * who learns the webhook URL could otherwise drive the assistant by claiming to
 * be the owner. The allowlist in config.ts is a filter on top of this, not a
 * substitute for it.
 *
 * Shape mirrors lib/agentmail/webhook.ts `verifySvixSignature`: read the raw
 * body before any parse, compare with `timingSafeEqual` behind a length guard,
 * and let the route fail CLOSED with a 500 when the secret is missing rather
 * than silently accepting everything.
 *
 * THE ALGORITHM (Twilio "Validating Signatures from Twilio"):
 *   1. Start with the full URL Twilio requested, query string included.
 *   2. For a form-encoded POST, sort the parameter names alphabetically and
 *      append each name immediately followed by its value, no separators.
 *   3. HMAC-SHA1 that string with the account's auth token; base64 the digest.
 *   4. Compare to the X-Twilio-Signature header.
 *
 * Implemented directly on node:crypto rather than pulling in the Twilio SDK.
 * The repo already hand-rolls its other webhook verification the same way, the
 * algorithm is four lines, and it keeps a large dependency (and its lockfile
 * churn) out of a route whose only other Twilio need is one REST POST.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifyTwilioSignatureInput {
  /** The account auth token. */
  authToken: string;
  /** The X-Twilio-Signature header value. */
  signature: string | null;
  /** The absolute URL Twilio requested, exactly as configured, with query. */
  url: string;
  /** The form parameters from the raw body. */
  params: Record<string, string>;
}

/**
 * Build the string Twilio signs: the URL with every sorted `key + value` pair
 * concatenated onto it. Exported for tests and for debugging a mismatch, which
 * is almost always a URL problem rather than a params problem.
 */
export function buildTwilioSignatureBase(
  url: string,
  params: Record<string, string>,
): string {
  let base = url;
  for (const key of Object.keys(params).sort()) {
    base += key + params[key];
  }
  return base;
}

/**
 * Parse a form-encoded webhook body into the flat record the signature uses.
 *
 * Twilio sends `application/x-www-form-urlencoded` for messaging webhooks and
 * does not repeat parameter names; if one ever repeats, the LAST value wins,
 * which is what a conventional body parser would have handed the official SDK.
 */
export function parseTwilioFormBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }
  return params;
}

/** Constant-time compare of two base64 signatures, with a length guard. */
function signaturesMatch(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected, "base64");
  const b = Buffer.from(candidate, "base64");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify an inbound Twilio webhook. Returns false for every failure mode
 * (missing secret, missing header, wrong URL, tampered body) — the caller
 * decides the status code.
 */
export function verifyTwilioSignature(input: VerifyTwilioSignatureInput): boolean {
  const { authToken, signature, url, params } = input;
  if (!authToken || !signature || !url) return false;

  const base = buildTwilioSignatureBase(url, params);
  const expected = createHmac("sha1", authToken).update(Buffer.from(base, "utf8")).digest("base64");

  try {
    return signaturesMatch(expected, signature);
  } catch {
    return false;
  }
}

/**
 * Rebuild the absolute URL Twilio signed.
 *
 * Signature verification compares against the URL as Twilio saw it, so behind a
 * proxy the request's own `url` is not enough: Vercel rewrites the host and the
 * protocol. Prefer an explicit TWILIO_WEBHOOK_URL when the deployment's public
 * URL cannot be reconstructed (a custom domain in front of a rewrite, say);
 * otherwise rebuild from the forwarded headers, which is correct for a normal
 * Vercel deployment.
 *
 * The explicit override carries the path and query verbatim when it includes
 * one, so a console entry copied straight into the env just works.
 */
export function resolveTwilioWebhookUrl(input: {
  requestUrl: string;
  headers: Headers;
  configuredUrl?: string;
}): string {
  const configured = input.configuredUrl?.trim();
  if (configured) return configured;

  const parsed = new URL(input.requestUrl);
  const proto = input.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || parsed.protocol.replace(":", "");
  const host =
    input.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    input.headers.get("host")?.trim() ||
    parsed.host;
  return `${proto}://${host}${parsed.pathname}${parsed.search}`;
}
