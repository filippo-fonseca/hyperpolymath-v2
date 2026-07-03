// read_whatsapp tool — schema + registration guarantees.
//
// The executor's result shape (grouped receipt, empty-hint fallback) is tested
// against the server executor in apps/web/tests. This suite covers the
// jarvis-core surface: the Zod schema, the tool entry in buildToolDefinitions,
// and the SendMessage schema's new "whatsapp" enum arm.

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/tools";
import { ReadWhatsappInputSchema } from "../src/tools/read-whatsapp";
import { SendMessageInputSchema } from "../src/tools/send-message";

describe("ReadWhatsappInputSchema", () => {
  it("accepts an empty input (all fields optional)", () => {
    expect(ReadWhatsappInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full input", () => {
    expect(
      ReadWhatsappInputSchema.safeParse({
        chat: "Alan",
        since_hours: 48,
        maxResults: 50,
        unrepliedOnly: true,
      }).success,
    ).toBe(true);
  });

  it("rejects since_hours > 168 (one-week cap)", () => {
    expect(ReadWhatsappInputSchema.safeParse({ since_hours: 200 }).success).toBe(false);
  });

  it("rejects maxResults > 100", () => {
    expect(ReadWhatsappInputSchema.safeParse({ maxResults: 500 }).success).toBe(false);
  });

  it("rejects unknown properties (strict schema)", () => {
    expect(ReadWhatsappInputSchema.safeParse({ nope: true }).success).toBe(false);
  });
});

describe("buildToolDefinitions — read_whatsapp registration", () => {
  it("registers read_whatsapp as non-strict, positioned before computer_use (after read_gmail + get_news)", () => {
    const tools = buildToolDefinitions();
    const names = tools.map((t) => t.name);
    const rw = tools.find((t) => t.name === "read_whatsapp");
    expect(rw).toBeDefined();
    expect(rw?.strict).toBe(false);
    expect(rw?.cache_control).toBeUndefined();
    const iWeather = names.indexOf("get_weather");
    const iGmail = names.indexOf("read_gmail");
    const iNews = names.indexOf("get_news");
    const iWa = names.indexOf("read_whatsapp");
    const iCu = names.indexOf("computer_use");
    expect(iWeather).toBeGreaterThan(-1);
    expect(iGmail).toBe(iWeather + 1);
    expect(iNews).toBe(iGmail + 1);
    expect(iWa).toBe(iNews + 1);
    expect(iCu).toBe(iWa + 1);
    expect(iCu).toBe(names.length - 1);
  });
});

describe("SendMessageInputSchema — WhatsApp support", () => {
  it("accepts app: 'imessage' (existing behaviour)", () => {
    const r = SendMessageInputSchema.safeParse({
      app: "imessage",
      recipient: "+14155551234",
      text: "hi",
    });
    expect(r.success).toBe(true);
  });

  it("accepts app: 'whatsapp'", () => {
    const r = SendMessageInputSchema.safeParse({
      app: "whatsapp",
      recipient: "+14155551234",
      text: "hi",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown app value", () => {
    const r = SendMessageInputSchema.safeParse({
      app: "signal",
      recipient: "someone",
      text: "hi",
    });
    expect(r.success).toBe(false);
  });
});
