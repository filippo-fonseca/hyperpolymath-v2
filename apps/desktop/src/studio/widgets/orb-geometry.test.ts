import { describe, expect, it } from "vitest";

import { getOrbTargetGeometry } from "./orb-geometry";

describe("orb flight geometry", () => {
  const stage = { width: 1232, height: 752 };

  it("rests centered at a 300px diameter", () => {
    const target = getOrbTargetGeometry(stage, false);

    expect(target).toMatchObject({ x: 0.5, y: 0.5 });
    expect(target.w * stage.width).toBeCloseTo(300);
    expect(target.h * stage.height).toBeCloseTo(300);
  });

  it("flies to a 32px-inset bottom-right anchor at a 124px diameter", () => {
    const target = getOrbTargetGeometry(stage, true);

    expect(target.h * stage.height).toBeCloseTo(124);
    expect((1 - target.x - target.w / 2) * stage.width).toBeCloseTo(32);
    expect((1 - target.y - target.h / 2) * stage.height).toBeCloseTo(32);
  });
});
