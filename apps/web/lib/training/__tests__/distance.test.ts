import { describe, expect, it } from "vitest";
import {
  displayToKm,
  formatDistance,
  kmToDisplay,
  KM_PER_MILE,
} from "../distance";

describe("distance / conversion", () => {
  it("kmToDisplay is identity for km", () => {
    expect(kmToDisplay(5, "km")).toBe(5);
  });

  it("displayToKm is identity for km", () => {
    expect(displayToKm(5, "km")).toBe(5);
  });

  it("5 mi → ~8.04672 km", () => {
    expect(displayToKm(5, "mi")).toBeCloseTo(5 * KM_PER_MILE, 6);
  });

  it("roundtrips km→mi→km within 4dp", () => {
    const km = 8.04672;
    const back = displayToKm(kmToDisplay(km, "mi"), "mi");
    expect(back).toBeCloseTo(km, 4);
  });
});

describe("distance / formatDistance", () => {
  it("returns em-dash for null", () => {
    expect(formatDistance(null, "km")).toBe("—");
    expect(formatDistance(undefined, "mi")).toBe("—");
  });

  it("formats small values with 2dp, large with 1dp", () => {
    expect(formatDistance(5, "km")).toBe("5.00 km");
    expect(formatDistance(15, "km")).toBe("15.0 km");
  });

  it("converts to mi when unit is mi", () => {
    expect(formatDistance(KM_PER_MILE, "mi")).toBe("1.00 mi");
  });
});
