import { describe, expect, it } from "vitest";

import { toPhysicalWebviewBounds } from "./native-webview";

describe("native webview bounds", () => {
  it("converts logical content coordinates to physical pixels", () => {
    expect(
      toPhysicalWebviewBounds(
        { left: 10.25, top: 20.5, width: 300.25, height: 199.75 },
        2,
      ),
    ).toEqual({ x: 21, y: 41, w: 601, h: 400 });
  });

  it("guards invalid scale factors and zero-sized transitional rects", () => {
    expect(
      toPhysicalWebviewBounds(
        { left: 4, top: 8, width: 0, height: 0 },
        Number.NaN,
      ),
    ).toEqual({ x: 4, y: 8, w: 1, h: 1 });
  });
});
