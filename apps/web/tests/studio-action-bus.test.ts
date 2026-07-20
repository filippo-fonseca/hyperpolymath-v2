import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_WIDGET_TOOL_DEFINITIONS,
  StudioCloseWidgetInputSchema,
  StudioOpenWidgetInputSchema,
  StudioSetHandCursorInputSchema,
} from "@/lib/jarvis/studio-widget-tools";
import { executeStudioSetHandCursor } from "@/lib/jarvis/executor";
import { emitStudioAction, physicalBus } from "@/lib/voice/physical-extension/bus";

afterEach(() => {
  physicalBus.removeAllListeners("studio-action");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

describe("Studio widget tools", () => {
  it("publishes the studio tool definitions", () => {
    expect(STUDIO_WIDGET_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "studio_open_widget",
      "studio_close_widget",
      "studio_set_hand_cursor",
    ]);
  });

  it("requires a URL for browser widgets and a close target", () => {
    expect(StudioOpenWidgetInputSchema.safeParse({ kind: "browser" }).success).toBe(false);
    expect(
      StudioOpenWidgetInputSchema.safeParse({
        kind: "browser",
        url: "https://example.com",
      }).success
    ).toBe(true);
    expect(StudioCloseWidgetInputSchema.safeParse({}).success).toBe(false);
  });

  it("validates the hand-cursor input (boolean enabled, no extras)", () => {
    expect(StudioSetHandCursorInputSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(StudioSetHandCursorInputSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(StudioSetHandCursorInputSchema.safeParse({}).success).toBe(false);
    expect(
      StudioSetHandCursorInputSchema.safeParse({ enabled: "yes" }).success
    ).toBe(false);
    expect(
      StudioSetHandCursorInputSchema.safeParse({ enabled: true, kind: "camera" }).success
    ).toBe(false);
  });
});

describe("studio-action physical bus", () => {
  it("emits a validated action on the existing bus", () => {
    const listener = vi.fn();
    physicalBus.on("studio-action", listener);

    emitStudioAction({ action: "open", kind: "weather" });

    expect(listener).toHaveBeenCalledWith({ action: "open", kind: "weather" });
  });

  it("refuses malformed actions before emitting", () => {
    const listener = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    physicalBus.on("studio-action", listener);

    emitStudioAction({ action: "open", kind: "not-a-widget" } as never);

    expect(listener).not.toHaveBeenCalled();
  });

  it("emits a validated hand action", () => {
    const listener = vi.fn();
    physicalBus.on("studio-action", listener);

    emitStudioAction({ action: "hand", enabled: true, userId: "u1" });

    expect(listener).toHaveBeenCalledWith({ action: "hand", enabled: true, userId: "u1" });
  });

  it("refuses a hand action without a boolean enabled", () => {
    const listener = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    physicalBus.on("studio-action", listener);

    emitStudioAction({ action: "hand" } as never);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("executeStudioSetHandCursor", () => {
  it("emits a hand studio-action and returns an enabled receipt", async () => {
    const listener = vi.fn();
    physicalBus.on("studio-action", listener);

    const engaged = await executeStudioSetHandCursor({ enabled: true }, "user-42");
    expect(engaged.ok).toBe(true);
    if (engaged.ok) {
      expect(engaged.receipt).toMatchObject({ enabled: true });
      expect(engaged.id).toMatch(/^studio_set_hand_cursor:true:/);
    }
    expect(listener).toHaveBeenCalledWith({
      action: "hand",
      enabled: true,
      userId: "user-42",
    });

    listener.mockClear();
    const disengaged = await executeStudioSetHandCursor({ enabled: false });
    expect(disengaged.ok).toBe(true);
    if (disengaged.ok) {
      expect(disengaged.receipt).toMatchObject({ enabled: false });
    }
    // No userId threaded => the emit omits it (the SSE filter treats absent as
    // "not for me", so this stays consistent with the widget executors).
    expect(listener).toHaveBeenCalledWith({ action: "hand", enabled: false });
  });
});
