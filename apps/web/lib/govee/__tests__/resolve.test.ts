import { describe, expect, it } from "vitest";
import {
  packRgb,
  resolveTargetDevice,
  type GoveeDeviceRow,
} from "../resolve-target";

function device(
  overrides: Partial<GoveeDeviceRow> & Pick<GoveeDeviceRow, "name" | "deviceId">,
): GoveeDeviceRow {
  return {
    id: overrides.id ?? `id-${overrides.deviceId}`,
    name: overrides.name,
    sku: overrides.sku ?? "H618A",
    deviceId: overrides.deviceId,
    isDefault: overrides.isDefault ?? false,
    capabilitiesCache: overrides.capabilitiesCache ?? null,
  };
}

describe("packRgb", () => {
  it("packs channels into a 24-bit integer", () => {
    expect(packRgb(255, 0, 128)).toBe(0xff0080);
    expect(packRgb(0, 0, 0)).toBe(0);
    expect(packRgb(255, 255, 255)).toBe(0xffffff);
  });
});

describe("resolveTargetDevice", () => {
  it("returns empty when no devices", () => {
    const r = resolveTargetDevice([], undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("empty");
  });

  it("matches device name case-insensitively", () => {
    const devices = [
      device({ name: "Desk", deviceId: "d1" }),
      device({ name: "Bed", deviceId: "d2" }),
    ];
    const r = resolveTargetDevice(devices, "desk");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.device.deviceId).toBe("d1");
  });

  it("falls back to partial name match when unique", () => {
    const devices = [
      device({ name: "Desk Strip", deviceId: "d1" }),
      device({ name: "Bedroom", deviceId: "d2" }),
    ];
    const r = resolveTargetDevice(devices, "desk");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.device.name).toBe("Desk Strip");
  });

  it("uses the sole device when name omitted", () => {
    const devices = [device({ name: "Only", deviceId: "solo" })];
    const r = resolveTargetDevice(devices, undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.device.deviceId).toBe("solo");
  });

  it("uses isDefault when multiple devices and no name", () => {
    const devices = [
      device({ name: "A", deviceId: "a", isDefault: false }),
      device({ name: "B", deviceId: "b", isDefault: true }),
    ];
    const r = resolveTargetDevice(devices, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.device.deviceId).toBe("b");
  });

  it("returns ambiguous when multiple devices, no name, no default", () => {
    const devices = [
      device({ name: "A", deviceId: "a" }),
      device({ name: "B", deviceId: "b" }),
    ];
    const r = resolveTargetDevice(devices, undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("ambiguous");
      expect(r.candidates).toEqual(["A", "B"]);
    }
  });

  it("returns not_found for unknown name", () => {
    const devices = [device({ name: "Desk", deviceId: "d1" })];
    const r = resolveTargetDevice(devices, "Kitchen");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("not_found");
  });
});
