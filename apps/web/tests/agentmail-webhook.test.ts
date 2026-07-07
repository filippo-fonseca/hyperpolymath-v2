import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  extractEmailAddress,
  getAllowedAgentMailSenders,
  isAllowedAgentMailSender,
  verifySvixSignature,
} from "@/lib/agentmail/webhook";

function signSvix(input: {
  payload: string;
  secret: string;
  svixId: string;
  svixTimestamp: string;
}): string {
  const key = Buffer.from(input.secret.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key)
    .update(`${input.svixId}.${input.svixTimestamp}.${input.payload}`)
    .digest("base64");
  return `v1,${digest}`;
}

describe("AgentMail webhook helpers", () => {
  it("extracts plain and display-name email addresses", () => {
    expect(extractEmailAddress("Filippo <Filippo.Fonseca@Yale.edu>")).toBe(
      "filippo.fonseca@yale.edu"
    );
    expect(extractEmailAddress("filifonsecacagnazzo@gmail.com")).toBe(
      "filifonsecacagnazzo@gmail.com"
    );
  });

  it("defaults to Filippo's two allowed sender addresses", () => {
    const allowed = getAllowedAgentMailSenders({});
    expect(allowed.has("filifonsecacagnazzo@gmail.com")).toBe(true);
    expect(allowed.has("filippo.fonseca@yale.edu")).toBe(true);
    expect(isAllowedAgentMailSender("Someone <other@example.com>", {})).toBe(false);
  });

  it("verifies Svix signatures and rejects stale payloads", () => {
    const payload = JSON.stringify({ event_type: "message.received" });
    const secret = `whsec_${Buffer.from("test-secret").toString("base64")}`;
    const svixId = "msg_123";
    const nowSeconds = 1_800_000_000;
    const svixTimestamp = String(nowSeconds);
    const svixSignature = signSvix({ payload, secret, svixId, svixTimestamp });

    expect(
      verifySvixSignature({
        payload,
        secret,
        svixId,
        svixTimestamp,
        svixSignature,
        nowMs: nowSeconds * 1000,
      })
    ).toBe(true);
    expect(
      verifySvixSignature({
        payload,
        secret,
        svixId,
        svixTimestamp,
        svixSignature,
        nowMs: (nowSeconds + 301) * 1000,
      })
    ).toBe(false);
  });
});
