import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_WIDGET_TOOL_DEFINITIONS,
  StudioCloseWidgetInputSchema,
  StudioOpenWidgetInputSchema,
} from "@/lib/jarvis/studio-widget-tools";
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
  it("publishes both tool definitions", () => {
    expect(STUDIO_WIDGET_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "studio_open_widget",
      "studio_close_widget",
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
});
