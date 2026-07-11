import { describe, expect, it } from "vitest";
import { reduceVoiceBridgeAction } from "../voice-bridge";

describe("voice bridge reducer", () => {
  it("accepts a newer action and records its timestamp", () => {
    const action = { type: "open_widget" as const, kind: "weather" as const, ts: 12 };
    expect(reduceVoiceBridgeAction({ lastTs: 8 }, action)).toEqual({
      state: { lastTs: 12 },
      action,
    });
  });

  it("deduplicates repeated and out-of-order broadcasts", () => {
    const action = { type: "close_widget" as const, all: true, ts: 12 };
    expect(reduceVoiceBridgeAction({ lastTs: 12 }, action).action).toBeNull();
    expect(reduceVoiceBridgeAction({ lastTs: 20 }, action).state).toEqual({ lastTs: 20 });
  });
});
