import { describe, expect, it } from "vitest";

import { toPhysicalWebviewBounds } from "./native-webview";

describe("native webview bounds", () => {
  it("converts logical content coordinates to physical pixels", () => {
    expect(
      toPhysicalWebviewBounds(
        { left: 10.25, top: 20.5, width: 300.25, height: 199.75 },
        2,
      ),
    ).toEqual({ x: 21, y: 41, w: 600, h: 399 });
  });

  it("guards invalid scale factors and zero-sized transitional rects", () => {
    expect(
      toPhysicalWebviewBounds({ left: 4, top: 8, width: 0, height: 0 }, Number.NaN),
    ).toEqual({ x: 4, y: 8, w: 1, h: 1 });
  });

  it("never overhangs the frame at fractional DPR (clamp far edge inward)", () => {
    // Independently rounding position and size can push x+w one physical pixel
    // past the placeholder rect. The clamp ceils the near edge and floors the
    // far edge, so x+w <= physical-right and y+h <= physical-bottom always. A
    // <=1px underhang is invisible; a >0 overhang is the defect we forbid.
    for (const scale of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      const rect = { left: 12.4, top: 7.9, width: 301.3, height: 200.7 };
      const bounds = toPhysicalWebviewBounds(rect, scale);
      const physRight = (rect.left + rect.width) * scale;
      const physBottom = (rect.top + rect.height) * scale;
      expect(bounds.x + bounds.w).toBeLessThanOrEqual(physRight);
      expect(bounds.y + bounds.h).toBeLessThanOrEqual(physBottom);
      expect(physRight - (bounds.x + bounds.w)).toBeLessThan(2);
      expect(physBottom - (bounds.y + bounds.h)).toBeLessThan(2);
    }
  });
});
