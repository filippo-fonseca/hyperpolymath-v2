import { describe, expect, it } from "vitest";

import {
  CONTACTS_RECHECK_MS,
  isCacheEntryFresh,
  normalizePhone,
  phoneFromJid,
  phonesMatch,
  pickContactName,
} from "./whatsapp-contacts";

describe("phoneFromJid", () => {
  it("extracts the digits from an individual chat jid", () => {
    expect(phoneFromJid("12036068566@s.whatsapp.net")).toBe("12036068566");
  });

  it("returns null for a group jid", () => {
    expect(phoneFromJid("120363012345678901@g.us")).toBeNull();
  });

  it("returns null for a linked-device (@lid) jid", () => {
    expect(phoneFromJid("98765@lid")).toBeNull();
  });

  it("returns null when there aren't enough digits to be a number", () => {
    expect(phoneFromJid("123@s.whatsapp.net")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("strips formatting and keeps the last 10 digits", () => {
    expect(normalizePhone("+1 (203) 606-8566")).toBe("2036068566");
    expect(normalizePhone("12036068566")).toBe("2036068566");
  });

  it("keeps the full string for short numbers", () => {
    expect(normalizePhone("5551212")).toBe("5551212");
  });
});

describe("phonesMatch", () => {
  it("matches the same number in different formats", () => {
    expect(phonesMatch("+1 (203) 606-8566", "2036068566")).toBe(true);
  });

  it("matches a country-code-prefixed number against a bare 10-digit one", () => {
    expect(phonesMatch("12036068566", "2036068566")).toBe(true);
  });

  it("does not match two different numbers", () => {
    expect(phonesMatch("2036068566", "2036068567")).toBe(false);
  });

  it("does not match empty input", () => {
    expect(phonesMatch("", "2036068566")).toBe(false);
  });
});

describe("pickContactName — display priority", () => {
  it("prefers the macOS Contacts name above all", () => {
    expect(pickContactName("Mamma", "Maria Rossi", "+1 203 606 8566")).toBe("Mamma");
  });

  it("falls back to a real synced WhatsApp name when Contacts has none", () => {
    expect(pickContactName(null, "Maria Rossi", "+1 203 606 8566")).toBe("Maria Rossi");
  });

  it("falls back to the pretty number when the synced name is just the number", () => {
    // Route already folded a numberless chat's name into `fallback`.
    expect(pickContactName(null, "+1 203 606 8566", "+1 203 606 8566")).toBe("+1 203 606 8566");
  });

  it("ignores a synced name that is a raw jid", () => {
    expect(pickContactName(null, "12036068566@s.whatsapp.net", "+1 203 606 8566")).toBe(
      "+1 203 606 8566",
    );
  });

  it("ignores a synced name with no letters (a bare number string)", () => {
    expect(pickContactName(null, "2036068566", "+1 203 606 8566")).toBe("+1 203 606 8566");
  });

  it("keeps a group subject as the fallback when there's no better name", () => {
    expect(pickContactName(null, null, "Family Group")).toBe("Family Group");
  });
});

describe("isCacheEntryFresh", () => {
  const now = 1_000_000_000_000;
  it("is fresh within the recheck window", () => {
    expect(isCacheEntryFresh({ name: "X", checkedAt: now - 1_000 }, now)).toBe(true);
  });
  it("is stale past the recheck window", () => {
    expect(isCacheEntryFresh({ name: "X", checkedAt: now - CONTACTS_RECHECK_MS - 1 }, now)).toBe(
      false,
    );
  });
});
