/**
 * logJarvisEvent must accept composite routine turnIds (e.g. `${runId}:brief`,
 * `${runId}:opener`, `${blockId}:filler`) without blowing up the uuid `id`
 * column. Guard: only pin `id` when it's a canonical uuid; otherwise fall back
 * to defaultRandom() so the telemetry row still lands.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertValuesSpy } = vi.hoisted(() => ({
  insertValuesSpy: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => insertValuesSpy(v),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  jarvisEvents: {},
}));

import { logJarvisEvent } from "@/lib/jarvis/log-event";

const baseInput = {
  userId: "c90be2d5-0000-0000-0000-000000000000",
  promptText: "hi",
  voiceActive: false,
  latencyMs: 42,
};

describe("logJarvisEvent uuid guard", () => {
  beforeEach(() => {
    insertValuesSpy.mockClear();
  });

  it("omits id when turnId is a composite routine string", async () => {
    await logJarvisEvent({ ...baseInput, id: "abc123:brief" });
    expect(insertValuesSpy).toHaveBeenCalledOnce();
    const values = insertValuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect("id" in values).toBe(false);
    expect(values.userId).toBe(baseInput.userId);
  });

  it("also omits id for `${runId}:opener` and `${blockId}:filler`", async () => {
    await logJarvisEvent({ ...baseInput, id: "some-run-id:opener" });
    await logJarvisEvent({ ...baseInput, id: "some-block-id:filler" });
    for (const call of insertValuesSpy.mock.calls) {
      expect("id" in (call[0] as object)).toBe(false);
    }
  });

  it("pins id when it is a canonical uuid", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    await logJarvisEvent({ ...baseInput, id: uuid });
    const values = insertValuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(values.id).toBe(uuid);
  });

  it("omits id when not provided at all (Phase 5 caller path)", async () => {
    await logJarvisEvent(baseInput);
    const values = insertValuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect("id" in values).toBe(false);
  });
});
