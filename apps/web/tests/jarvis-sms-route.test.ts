/**
 * Route-level contract for POST /api/jarvis/sms.
 *
 * The webhook is the security boundary for the whole text channel, so its
 * behaviour is pinned here rather than left to manual testing against a live
 * Twilio number: an unverified webhook that answers 200 is an open door to
 * anyone who learns the URL.
 *
 * processInboundSms is mocked, so nothing here touches a database or the
 * Anthropic API. What is asserted is exactly what the route itself owns:
 * signature verification, failing closed, the async acknowledgement, and the
 * payload it hands downstream.
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processInboundSms = vi.hoisted(() => vi.fn(async () => ({ status: "done" as const, turnId: "t1" })));
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock("@/lib/twilio/process-sms", () => ({
  processInboundSms,
  SMS_DEVICE_LABEL: "SMS",
  SMS_ACK_AFTER_MS: 20_000,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // Capture rather than run: the point of after() is that it happens AFTER
    // the response, so the test drains it explicitly.
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn);
    },
  };
});

const { POST } = await import("@/app/api/jarvis/sms/route");

const AUTH_TOKEN = "test-auth-token-0123456789abcdef";
const WEBHOOK_URL = "https://kiwi.example.com/api/jarvis/sms";

const FORM = new URLSearchParams({
  MessageSid: "SM0123456789abcdef0123456789abcdef",
  From: "+12035550148",
  To: "+12035550199",
  Body: "add a task to call the dentist",
  NumMedia: "0",
});

function signature(body: string, url = WEBHOOK_URL, token = AUTH_TOKEN): string {
  const params = Object.fromEntries(new URLSearchParams(body));
  const base =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", token).update(Buffer.from(base, "utf8")).digest("base64");
}

function request(body: string, headers: Record<string, string>) {
  return {
    url: WEBHOOK_URL,
    headers: new Headers(headers),
    text: async () => body,
  } as unknown as import("next/server").NextRequest;
}

async function drainAfter(): Promise<void> {
  while (afterCallbacks.length > 0) {
    await afterCallbacks.shift()?.();
  }
}

beforeEach(() => {
  afterCallbacks.length = 0;
  processInboundSms.mockClear();
  vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
  vi.stubEnv("TWILIO_WEBHOOK_URL", WEBHOOK_URL);
  vi.stubEnv("JARVIS_SMS_SKIP_SIGNATURE_VERIFICATION", "");
  vi.stubEnv("JARVIS_SMS_RESPONSE_TWIML", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/jarvis/sms — signature verification", () => {
  it("rejects an invalid signature with a 401 and never processes it", async () => {
    const body = FORM.toString();
    const res = await POST(request(body, { "x-twilio-signature": "definitely-not-valid" }));
    expect(res.status).toBe(401);
    await drainAfter();
    expect(processInboundSms).not.toHaveBeenCalled();
  });

  it("rejects a signature minted for a different URL", async () => {
    const body = FORM.toString();
    const res = await POST(
      request(body, { "x-twilio-signature": signature(body, "https://evil.example.com/api/jarvis/sms") }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a body tampered with after signing", async () => {
    const signed = signature(FORM.toString());
    const tampered = new URLSearchParams(FORM);
    tampered.set("Body", "delete everything");
    const res = await POST(request(tampered.toString(), { "x-twilio-signature": signed }));
    expect(res.status).toBe(401);
  });

  it("FAILS CLOSED with a 500 when the signing secret is unset, never a 200", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const body = FORM.toString();
    const res = await POST(request(body, { "x-twilio-signature": signature(body) }));
    expect(res.status).toBe(500);
    await drainAfter();
    expect(processInboundSms).not.toHaveBeenCalled();
  });

  it("honours the test-only skip flag, mirroring the AgentMail escape hatch", async () => {
    vi.stubEnv("JARVIS_SMS_SKIP_SIGNATURE_VERIFICATION", "true");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const res = await POST(request(FORM.toString(), {}));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/jarvis/sms — accepted path", () => {
  it("acknowledges immediately and runs the turn after the response", async () => {
    const body = FORM.toString();
    const res = await POST(request(body, { "x-twilio-signature": signature(body) }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      accepted: true,
      messageSid: "SM0123456789abcdef0123456789abcdef",
    });
    // Still nothing done: the work is queued behind the response.
    expect(processInboundSms).not.toHaveBeenCalled();

    await drainAfter();
    expect(processInboundSms).toHaveBeenCalledWith({
      messageSid: "SM0123456789abcdef0123456789abcdef",
      from: "+12035550148",
      to: "+12035550199",
      body: "add a task to call the dentist",
      mediaCount: 0,
    });
  });

  it("passes the MMS attachment count through", async () => {
    const mms = new URLSearchParams(FORM);
    mms.set("NumMedia", "2");
    const body = mms.toString();
    await POST(request(body, { "x-twilio-signature": signature(body) }));
    await drainAfter();
    expect(processInboundSms).toHaveBeenCalledWith(expect.objectContaining({ mediaCount: 2 }));
  });

  it("can answer with empty TwiML instead, for a quiet Twilio console", async () => {
    vi.stubEnv("JARVIS_SMS_RESPONSE_TWIML", "true");
    const body = FORM.toString();
    const res = await POST(request(body, { "x-twilio-signature": signature(body) }));
    expect(res.headers.get("content-type")).toContain("text/xml");
    await expect(res.text()).resolves.toContain("<Response></Response>");
  });

  it("rejects a payload missing the fields the ledger needs", async () => {
    const partial = new URLSearchParams({ From: "+12035550148" }).toString();
    const res = await POST(request(partial, { "x-twilio-signature": signature(partial) }));
    expect(res.status).toBe(400);
    await drainAfter();
    expect(processInboundSms).not.toHaveBeenCalled();
  });
});
