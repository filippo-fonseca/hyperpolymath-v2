import {
  DOCK_WIDTH_COLLAPSED,
  DOCK_WIDTH_EXPANDED,
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  clampPanelWidth,
  computeRightSlotWidth,
} from "@/components/shell/cockpit/right-slot-context";
import { describe, expect, it } from "vitest";

/**
 * The right slot is one grid track shared by the Dock and any SidePanel
 * (SDC-1 §2.2). Its width is derived rather than stored, which is what makes
 * "closing a panel restores the Dock to its prior collapse state" fall out for
 * free instead of needing a saved-and-restored flag. These are the two pure
 * functions that decision reduces to.
 */

describe("clampPanelWidth", () => {
  it("defaults to 380 when the feature does not ask for a width", () => {
    expect(clampPanelWidth(undefined)).toBe(PANEL_WIDTH_DEFAULT);
  });

  it("clamps to the 320-560 band", () => {
    expect(clampPanelWidth(120)).toBe(PANEL_WIDTH_MIN);
    expect(clampPanelWidth(900)).toBe(PANEL_WIDTH_MAX);
    expect(clampPanelWidth(420)).toBe(420);
  });
});

describe("computeRightSlotWidth", () => {
  const dockExpanded = {
    panel: null,
    dockAvailable: true,
    dockCollapsed: false,
    atLeastXl: true,
  };

  it("gives the track to the Dock when no panel is registered", () => {
    expect(computeRightSlotWidth(dockExpanded)).toBe(`${DOCK_WIDTH_EXPANDED}px`);
  });

  it("hands the whole track to a panel, sliding the Dock out", () => {
    expect(
      computeRightSlotWidth({
        ...dockExpanded,
        panel: { id: "a", width: 420, side: "right" },
      })
    ).toBe("420px");
  });

  it("restores the Dock's prior collapse state when the panel closes", () => {
    const collapsed = { ...dockExpanded, dockCollapsed: true };
    const withPanel = {
      ...collapsed,
      panel: { id: "a", width: 380, side: "right" as const },
    };
    expect(computeRightSlotWidth(withPanel)).toBe("380px");
    expect(computeRightSlotWidth(collapsed)).toBe(`${DOCK_WIDTH_COLLAPSED}px`);
  });

  it("forces the Dock collapsed below 1280px without touching the preference", () => {
    expect(computeRightSlotWidth({ ...dockExpanded, atLeastXl: false })).toBe(
      `${DOCK_WIDTH_COLLAPSED}px`
    );
  });

  it("closes the track entirely when the Dock is unavailable", () => {
    expect(computeRightSlotWidth({ ...dockExpanded, dockAvailable: false })).toBe("0px");
  });

  it("still gives a panel its width when the Dock is unavailable", () => {
    expect(
      computeRightSlotWidth({
        ...dockExpanded,
        dockAvailable: false,
        panel: { id: "a", width: 380, side: "right" },
      })
    ).toBe("380px");
  });
});
