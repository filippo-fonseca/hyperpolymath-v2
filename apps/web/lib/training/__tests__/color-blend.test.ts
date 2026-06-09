import { describe, expect, it } from "vitest";
import {
  blendOklch,
  blendOklchStrings,
  formatOklch,
  parseOklch,
} from "../color-blend";

describe("color-blend / parseOklch", () => {
  it("parses percent lightness", () => {
    const o = parseOklch("oklch(65% 0.13 25)");
    expect(o.l).toBeCloseTo(0.65, 5);
    expect(o.c).toBeCloseTo(0.13, 5);
    expect(o.h).toBeCloseTo(25, 5);
  });

  it("round-trips through formatOklch", () => {
    const s = formatOklch(parseOklch("oklch(70.2% 0.142 187.4)"));
    expect(s).toBe("oklch(70.2% 0.142 187.4)");
  });
});

describe("color-blend / blendOklch", () => {
  it("is idempotent for a single color", () => {
    const blue = parseOklch("oklch(60% 0.14 250)");
    const blended = blendOklch([blue]);
    expect(blended).toEqual(blue);
  });

  it("blends warm-red + magenta on the warm side of the hue circle, not into cyan", () => {
    // Hues 25° (warm red) and 350° (magenta-rose).
    // Linear average would be 187.5° (cyan — WRONG).
    // Circular average should land in [350°..360°] ∪ [0°..25°], i.e. still warm.
    const out = blendOklch(
      [
        { l: 0.65, c: 0.16, h: 25 },
        { l: 0.65, c: 0.15, h: 350 },
      ],
    );
    // Expect hue near 7.5° (or equivalently ~360..360); definitely NOT near 180°.
    const distanceFromCyan = Math.min(
      Math.abs(out.h - 180),
      360 - Math.abs(out.h - 180),
    );
    expect(distanceFromCyan).toBeGreaterThan(150);
    // Sanity: hue is warm — within 30° of 0° (mod 360).
    const distanceFromRed = Math.min(out.h, 360 - out.h);
    expect(distanceFromRed).toBeLessThan(30);
  });

  it("weights bias the blend toward the heavier color", () => {
    const a = { l: 0.65, c: 0.13, h: 25 }; // warm red
    const b = { l: 0.65, c: 0.13, h: 210 }; // cyan
    const heavyB = blendOklch([a, b], [10, 90]);
    // Heavy on cyan → hue should sit near 210°, not at the midpoint.
    expect(Math.abs(heavyB.h - 210)).toBeLessThan(30);
  });

  it("blendOklchStrings preserves the OKLCH wrapper format", () => {
    const s = blendOklchStrings([
      "oklch(60% 0.14 220)",
      "oklch(60% 0.14 220)",
    ]);
    expect(s.startsWith("oklch(")).toBe(true);
    expect(s.endsWith(")")).toBe(true);
  });

  it("throws on empty input", () => {
    expect(() => blendOklch([])).toThrow();
  });
});
