/**
 * `editAffectsGuests` / `sameEmailSet` — the pure decision behind the
 * "email guests" choice at save time (sendUpdates all|none).
 */

import { describe, expect, it } from "vitest";
import {
  editAffectsGuests,
  sameEmailSet,
} from "@/lib/gcal/guest-updates";

describe("sameEmailSet", () => {
  it("ignores order, case, and surrounding whitespace", () => {
    expect(
      sameEmailSet(["A@x.com", "b@y.com"], [" b@Y.com ", "a@X.com"]),
    ).toBe(true);
  });

  it("detects additions and removals", () => {
    expect(sameEmailSet(["a@x.com"], ["a@x.com", "b@y.com"])).toBe(false);
    expect(sameEmailSet(["a@x.com", "b@y.com"], ["a@x.com"])).toBe(false);
    expect(sameEmailSet([], [])).toBe(true);
  });
});

describe("editAffectsGuests", () => {
  const base = {
    prevGuests: [] as string[],
    nextGuests: [] as string[],
    timeChanged: false,
    meetChanged: false,
  };

  it("create: affected iff there are guests", () => {
    expect(
      editAffectsGuests({ ...base, mode: "create", nextGuests: ["a@x.com"] }),
    ).toBe(true);
    expect(editAffectsGuests({ ...base, mode: "create" })).toBe(false);
    // Time/meet alone never matter on create without guests.
    expect(
      editAffectsGuests({
        ...base,
        mode: "create",
        timeChanged: true,
        meetChanged: true,
      }),
    ).toBe(false);
  });

  it("edit: guest-list change is always affecting (including remove-all)", () => {
    expect(
      editAffectsGuests({
        ...base,
        mode: "edit",
        prevGuests: ["a@x.com"],
        nextGuests: ["a@x.com", "b@y.com"],
      }),
    ).toBe(true);
    expect(
      editAffectsGuests({
        ...base,
        mode: "edit",
        prevGuests: ["a@x.com"],
        nextGuests: [],
      }),
    ).toBe(true);
  });

  it("edit: unchanged guests need a time or meet change to matter", () => {
    const guests = ["a@x.com", "b@y.com"];
    expect(
      editAffectsGuests({
        ...base,
        mode: "edit",
        prevGuests: guests,
        nextGuests: guests,
      }),
    ).toBe(false);
    expect(
      editAffectsGuests({
        ...base,
        mode: "edit",
        prevGuests: guests,
        nextGuests: guests,
        timeChanged: true,
      }),
    ).toBe(true);
    expect(
      editAffectsGuests({
        ...base,
        mode: "edit",
        prevGuests: guests,
        nextGuests: guests,
        meetChanged: true,
      }),
    ).toBe(true);
  });

  it("edit: no guests at all means nothing to send", () => {
    expect(
      editAffectsGuests({
        ...base,
        mode: "edit",
        timeChanged: true,
        meetChanged: true,
      }),
    ).toBe(false);
  });
});
