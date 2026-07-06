// Routine spec validation + derived-helper tests. This is a critical-path
// contract: the web server actions Zod-validate against zRoutineSpec before
// persisting, and computeNextRunAt / deriveTriggerTypes feed the denormalized
// first-class DB columns the scheduler queries.

import { describe, expect, it } from "vitest";
import {
  ROUTINE_SPEC_VERSION,
  computeNextRunAt,
  deriveTriggerTypes,
  zRoutineSpec,
  zRoutineTrigger,
} from "../src/routines";
import type { RoutineSpec } from "../src/routines";

// A minimal valid block reused across cases.
const block = (id: string, tool = "open_url") => ({
  id,
  tool,
  params: {},
});

describe("zRoutineTrigger (discriminated union)", () => {
  it("accepts a wake trigger", () => {
    expect(
      zRoutineTrigger.safeParse({ type: "wake", phrase: "daddy's home" })
        .success,
    ).toBe(true);
  });

  it("accepts an utterance trigger", () => {
    expect(
      zRoutineTrigger.safeParse({ type: "utterance", match: "let's go" })
        .success,
    ).toBe(true);
  });

  it("accepts a time trigger with and without tz", () => {
    expect(zRoutineTrigger.safeParse({ type: "time", at: "07:30" }).success).toBe(
      true,
    );
    expect(
      zRoutineTrigger.safeParse({
        type: "time",
        at: "23:59",
        tz: "America/New_York",
      }).success,
    ).toBe(true);
  });

  it("accepts a hotkey trigger", () => {
    expect(
      zRoutineTrigger.safeParse({ type: "hotkey", accelerator: "Cmd+Shift+J" })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown trigger type", () => {
    expect(
      zRoutineTrigger.safeParse({ type: "smart", context: "at work" }).success,
    ).toBe(false);
  });

  it.each(["25:00", "9:5", "07:60", "0730", "7:30 am"])(
    "rejects bad HH:MM %s",
    (at) => {
      expect(zRoutineTrigger.safeParse({ type: "time", at }).success).toBe(false);
    },
  );

  it("rejects an empty wake phrase", () => {
    expect(zRoutineTrigger.safeParse({ type: "wake", phrase: "" }).success).toBe(
      false,
    );
  });
});

describe("zRoutineSpec", () => {
  it("parses a full spec and preserves block order", () => {
    const parsed = zRoutineSpec.parse({
      version: ROUTINE_SPEC_VERSION,
      triggers: [{ type: "time", at: "08:00" }],
      blocks: [block("a"), block("b"), block("c")],
    });
    expect(parsed.blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("defaults block params to {} when omitted", () => {
    const parsed = zRoutineSpec.parse({
      version: ROUTINE_SPEC_VERSION,
      triggers: [{ type: "wake", phrase: "hey" }],
      blocks: [{ id: "x", tool: "get_weather" }],
    });
    expect(parsed.blocks[0]!.params).toEqual({});
  });

  it("carries nlDirective through when present", () => {
    const parsed = zRoutineSpec.parse({
      version: ROUTINE_SPEC_VERSION,
      triggers: [{ type: "wake", phrase: "hey" }],
      blocks: [{ id: "x", tool: "get_news", params: {}, nlDirective: "brief me" }],
    });
    expect(parsed.blocks[0]!.nlDirective).toBe("brief me");
  });

  it("rejects an empty triggers array", () => {
    expect(
      zRoutineSpec.safeParse({
        version: ROUTINE_SPEC_VERSION,
        triggers: [],
        blocks: [block("a")],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty blocks array", () => {
    expect(
      zRoutineSpec.safeParse({
        version: ROUTINE_SPEC_VERSION,
        triggers: [{ type: "wake", phrase: "hey" }],
        blocks: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    expect(
      zRoutineSpec.safeParse({
        version: 2,
        triggers: [{ type: "wake", phrase: "hey" }],
        blocks: [block("a")],
      }).success,
    ).toBe(false);
  });
});

describe("deriveTriggerTypes", () => {
  it("dedupes and reflects all present trigger types", () => {
    const spec: RoutineSpec = {
      version: ROUTINE_SPEC_VERSION,
      triggers: [
        { type: "time", at: "08:00" },
        { type: "wake", phrase: "hey" },
        { type: "time", at: "20:00" },
      ],
      blocks: [{ id: "a", tool: "get_weather", params: {} }],
    };
    expect(deriveTriggerTypes(spec).sort()).toEqual(["time", "wake"]);
  });

  it("returns an empty-derived set only reflecting existing types", () => {
    const spec: RoutineSpec = {
      version: ROUTINE_SPEC_VERSION,
      triggers: [{ type: "hotkey", accelerator: "Cmd+J" }],
      blocks: [{ id: "a", tool: "get_weather", params: {} }],
    };
    expect(deriveTriggerTypes(spec)).toEqual(["hotkey"]);
  });
});

describe("computeNextRunAt", () => {
  const tz = "America/New_York";
  // Fixed reference: 2026-07-03 12:00:00 America/New_York = 16:00 UTC (EDT, -4).
  const now = new Date("2026-07-03T16:00:00.000Z");

  const specWith = (
    triggers: RoutineSpec["triggers"],
  ): RoutineSpec => ({
    version: ROUTINE_SPEC_VERSION,
    triggers,
    blocks: [{ id: "a", tool: "get_weather", params: {} }],
  });

  it("returns null when there is no time trigger", () => {
    expect(
      computeNextRunAt(specWith([{ type: "wake", phrase: "hey" }]), tz, now),
    ).toBeNull();
  });

  it("keeps a later-today fire time today", () => {
    // 20:00 local (EDT) = 00:00 UTC next day, but still the same local day.
    const result = computeNextRunAt(
      specWith([{ type: "time", at: "20:00", tz }]),
      tz,
      now,
    );
    expect(result).toBe("2026-07-04T00:00:00.000Z");
  });

  it("rolls an already-passed fire time to tomorrow", () => {
    // 08:00 local already passed (now is 12:00 local) → tomorrow 08:00 EDT = 12:00 UTC.
    const result = computeNextRunAt(
      specWith([{ type: "time", at: "08:00", tz }]),
      tz,
      now,
    );
    expect(result).toBe("2026-07-04T12:00:00.000Z");
  });

  it("picks the earliest of multiple time triggers", () => {
    const result = computeNextRunAt(
      specWith([
        { type: "time", at: "08:00", tz }, // tomorrow 12:00 UTC
        { type: "time", at: "20:00", tz }, // today 00:00 UTC (2026-07-04)
      ]),
      tz,
      now,
    );
    expect(result).toBe("2026-07-04T00:00:00.000Z");
  });

  it("falls back to fallbackTz when a time trigger omits tz", () => {
    const result = computeNextRunAt(
      specWith([{ type: "time", at: "20:00" }]),
      tz,
      now,
    );
    expect(result).toBe("2026-07-04T00:00:00.000Z");
  });
});
