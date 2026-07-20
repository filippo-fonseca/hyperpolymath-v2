import { describe, expect, it } from "vitest";
import { findOptionByName, selectDevice } from "../device";
import type { GoveeDevice } from "../types";

const devices: GoveeDevice[] = [
  { sku: "H618A", device: "id-1", deviceName: "H618A_3D85", capabilities: [] },
  { sku: "H6001", device: "id-2", deviceName: "Desk", capabilities: [] },
];

describe("selectDevice", () => {
  it("selects by device name without case sensitivity", () => {
    expect(selectDevice(devices, { deviceName: "h618a_3d85" }).device).toBe("id-1");
  });

  it("prefers an exact ID over other selectors", () => {
    expect(selectDevice(devices, { deviceId: "ID-2", sku: "H618A" }).device).toBe("id-2");
  });

  it("fails clearly when no device matches", () => {
    expect(() => selectDevice(devices, { sku: "missing" })).toThrow(/No matching/);
  });
});

describe("findOptionByName", () => {
  it("matches option names case-insensitively", () => {
    const match = findOptionByName([{ name: "Sunrise", value: 1 }], "sunrise");
    expect(match?.value).toBe(1);
  });
});
