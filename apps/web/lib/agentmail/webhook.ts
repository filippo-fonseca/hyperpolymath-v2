import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_ALLOWED_SENDERS = ["filifonsecacagnazzo@gmail.com", "filippo.fonseca@yale.edu"];

type AgentMailSenderEnv = { AGENTMAIL_ALLOWED_SENDERS?: string };

export function extractEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const bracketMatch = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const raw = bracketMatch?.[1] ?? value.match(/[^\s<>"]+@[^\s<>"]+/)?.[0];
  return raw
    ? raw
        .trim()
        .toLowerCase()
        .replace(/[>,;]+$/g, "")
    : null;
}

export function getAllowedAgentMailSenders(
  env: AgentMailSenderEnv = process.env as AgentMailSenderEnv
): Set<string> {
  const configured = env.AGENTMAIL_ALLOWED_SENDERS?.split(",")
    .map((v) => extractEmailAddress(v))
    .filter((v): v is string => Boolean(v));
  return new Set(
    (configured?.length ? configured : DEFAULT_ALLOWED_SENDERS).map((v) => v.toLowerCase())
  );
}

export function isAllowedAgentMailSender(
  sender: string,
  env: AgentMailSenderEnv = process.env as AgentMailSenderEnv
): boolean {
  const email = extractEmailAddress(sender);
  return Boolean(email && getAllowedAgentMailSenders(env).has(email));
}

export function verifySvixSignature(input: {
  payload: string;
  secret: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  nowMs?: number;
}): boolean {
  const { payload, secret, svixId, svixTimestamp, svixSignature } = input;
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageMs = Math.abs((input.nowMs ?? Date.now()) - timestampSeconds * 1000);
  if (ageMs > 5 * 60 * 1000) return false;

  const secretBody = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(secretBody, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = createHmac("sha256", key).update(signedContent).digest();
  const signatures = svixSignature.split(" ");

  return signatures.some((sig) => {
    const [, encoded] = sig.split(",");
    if (!encoded) return false;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(encoded, "base64");
    } catch {
      return false;
    }
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
