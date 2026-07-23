import { describe, expect, it } from "vitest";

import {
  DRAWER_STOW_MARGIN,
  shouldStowInDrawer,
  type EdgeRect,
} from "./drawer-stow";

// A drawer pinned to the right edge of a 1440px-wide stage: 288px wide, full
// height. drawerRect.right == stage right edge, as the runtime rect always is.
const DRAWER: EdgeRect = { left: 1152, top: 0, right: 1440, bottom: 900 };

describe("shouldStowInDrawer", () => {
  it("does NOT stow a small widget whose body is far from the drawer even with pointer overshoot", () => {
    // 220px-wide widget centered near stage-left. The synthetic pointer may have
    // overshot into the drawer zone, but the clamped body is nowhere near it.
    const widget: EdgeRect = { left: 200, top: 300, right: 420, bottom: 520 };
    expect(shouldStowInDrawer(widget, DRAWER)).toBe(false);
  });

  it("stows a small widget genuinely over the drawer (center past the threshold)", () => {
    // Center at 1200 > drawerRect.left - margin (1152 - 24 = 1128).
    const widget: EdgeRect = { left: 1090, top: 300, right: 1310, bottom: 520 };
    expect((widget.left + widget.right) / 2).toBeGreaterThan(
      DRAWER.left - DRAWER_STOW_MARGIN,
    );
    expect(shouldStowInDrawer(widget, DRAWER)).toBe(true);
  });

  it("does not stow a small widget whose center sits just shy of the margin threshold", () => {
    // Center at 1120 < 1128 threshold → not stowed.
    const widget: EdgeRect = { left: 1010, top: 300, right: 1230, bottom: 520 };
    expect(shouldStowInDrawer(widget, DRAWER)).toBe(false);
  });

  it("uses the right-edge fallback for a very wide widget whose center can never reach the threshold", () => {
    // 1240px-wide widget: max reachable center = 1440 - 620 = 820, far below the
    // 1128 primary threshold, so the center test can never fire. It stows only
    // once the RIGHT EDGE reaches into the drawer proper.
    const width = 1240;
    const maxReachableCenter = DRAWER.right - width / 2;
    expect(maxReachableCenter).toBeLessThan(DRAWER.left - DRAWER_STOW_MARGIN);

    // Right edge reaches the drawer's left → stowed via fallback.
    const overDrawer: EdgeRect = { left: 40, top: 300, right: 1280, bottom: 520 };
    expect(shouldStowInDrawer(overDrawer, DRAWER)).toBe(true);

    // Same-width widget clamped so its right edge stops short of the drawer →
    // not stowed (deliberate drops only).
    const shortOfDrawer: EdgeRect = { left: -100, top: 300, right: 1140, bottom: 520 };
    expect(shouldStowInDrawer(shortOfDrawer, DRAWER)).toBe(false);
  });

  it("does not stow when the widget does not vertically overlap the drawer", () => {
    const belowDrawer: EdgeRect = {
      left: 1090,
      top: 950,
      right: 1310,
      bottom: 1100,
    };
    expect(shouldStowInDrawer(belowDrawer, DRAWER)).toBe(false);
  });
});
