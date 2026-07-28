import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildTwilioSignatureBase,
  parseTwilioFormBody,
  resolveTwilioWebhookUrl,
  verifyTwilioSignature,
} from "../signature";

const AUTH_TOKEN = "test-auth-token-0123456789abcdef";
const URL_UNDER_TEST = "https://app.example.com/api/jarvis/sms";

/** The reference implementation, written independently of the module. */
function sign(url: string, params: Record<string, string>, token = AUTH_TOKEN): string {
  const base =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", token).update(Buffer.from(base, "utf8")).digest("base64");
}

const PARAMS = {
  MessageSid: "SM0123456789abcdef0123456789abcdef",
  From: "+12035550148",
  To: "+12035550199",
  Body: "add a task to call the dentist",
};

describe("buildTwilioSignatureBase", () => {
  it("appends params sorted by key, with no separators", () => {
    expect(buildTwilioSignatureBase("https://x/y", { b: "2", a: "1" })).toBe("https://x/ya1b2");
  });

  it("is the URL alone when there are no params", () => {
    expect(buildTwilioSignatureBase("https://x/y", {})).toBe("https://x/y");
  });
});

describe("parseTwilioFormBody", () => {
  it("decodes a form-encoded body", () => {
    const parsed = parseTwilioFormBody("From=%2B12035550148&Body=hello+there");
    expect(parsed.From).toBe("+12035550148");
    expect(parsed.Body).toBe("hello there");
  });

  it("takes the last value when a key repeats", () => {
    expect(parseTwilioFormBody("a=1&a=2").a).toBe("2");
  });
});

describe("verifyTwilioSignature", () => {
  it("accepts a correctly signed request", () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signature: sign(URL_UNDER_TEST, PARAMS),
        url: URL_UNDER_TEST,
        params: PARAMS,
      })
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = sign(URL_UNDER_TEST, PARAMS);
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signature,
        url: URL_UNDER_TEST,
        params: { ...PARAMS, Body: "delete every task" },
      })
    ).toBe(false);
  });

  it("rejects a signature minted for a different URL", () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signature: sign("https://evil.example.com/api/jarvis/sms", PARAMS),
        url: URL_UNDER_TEST,
        params: PARAMS,
      })
    ).toBe(false);
  });

  it("rejects a signature minted with a different token", () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signature: sign(URL_UNDER_TEST, PARAMS, "some-other-token"),
        url: URL_UNDER_TEST,
        params: PARAMS,
      })
    ).toBe(false);
  });

  it("fails closed on a missing header, token or URL", () => {
    const signature = sign(URL_UNDER_TEST, PARAMS);
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signature: null,
        url: URL_UNDER_TEST,
        params: PARAMS,
      })
    ).toBe(false);
    expect(
      verifyTwilioSignature({ authToken: "", signature, url: URL_UNDER_TEST, params: PARAMS })
    ).toBe(false);
    expect(
      verifyTwilioSignature({ authToken: AUTH_TOKEN, signature, url: "", params: PARAMS })
    ).toBe(false);
  });

  it("rejects garbage that is not base64 of the right length", () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signature: "not-a-real-signature",
        url: URL_UNDER_TEST,
        params: PARAMS,
      })
    ).toBe(false);
  });
});

describe("resolveTwilioWebhookUrl", () => {
  it("prefers an explicit configured URL", () => {
    expect(
      resolveTwilioWebhookUrl({
        requestUrl: "http://10.0.0.1:3000/api/jarvis/sms",
        headers: new Headers(),
        configuredUrl: "https://kiwi.example.com/api/jarvis/sms",
      })
    ).toBe("https://kiwi.example.com/api/jarvis/sms");
  });

  it("rebuilds from proxy headers, which is what Vercel gives us", () => {
    expect(
      resolveTwilioWebhookUrl({
        requestUrl: "http://10.0.0.1:3000/api/jarvis/sms?x=1",
        headers: new Headers({
          "x-forwarded-proto": "https",
          "x-forwarded-host": "kiwi.example.com",
          host: "10.0.0.1:3000",
        }),
      })
    ).toBe("https://kiwi.example.com/api/jarvis/sms?x=1");
  });

  it("falls back to the Host header when there is no forwarded host", () => {
    expect(
      resolveTwilioWebhookUrl({
        requestUrl: "http://localhost:3000/api/jarvis/sms",
        headers: new Headers({ host: "localhost:3000" }),
      })
    ).toBe("http://localhost:3000/api/jarvis/sms");
  });
});
