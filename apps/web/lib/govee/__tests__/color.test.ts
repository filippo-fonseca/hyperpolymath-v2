import { describe, expect, it } from "vitest";
import { parseColor, rgbToInteger } from "../color";

describe("parseColor", () => {
  it("parses supported color formats", () => {
    expect(parseColor("#12abEF")).toEqual({ red: 18, green: 171, blue: 239 });
    expect(parseColor("255, 0, 128")).toEqual({ red: 255, green: 0, blue: 128 });
    expect(parseColor("warmwhite")).toEqual({ red: 255, green: 215, blue: 160 });
  });

  it("converts RGB to the integer expected by Govee", () => {
    expect(rgbToInteger({ red: 255, green: 0, blue: 128 })).toBe(0xff0080);
  });

  it("rejects invalid colors", () => {
    expect(() => parseColor("300,0,0")).toThrow(/0 to 255/);
    expect(() => parseColor("not-a-color")).toThrow(/Invalid color/);
  });
});
