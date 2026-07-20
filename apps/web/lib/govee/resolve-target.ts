/** Pure Govee device-resolution helpers (safe for unit tests). */

export interface GoveeDeviceRow {
  id: string;
  name: string;
  sku: string;
  deviceId: string;
  isDefault: boolean;
  capabilitiesCache: unknown;
}

export type ResolveTargetOk = { ok: true; device: GoveeDeviceRow };
export type ResolveTargetErr = {
  ok: false;
  kind: "not_found" | "ambiguous" | "empty";
  error: string;
  candidates?: string[];
};
export type ResolveTargetResult = ResolveTargetOk | ResolveTargetErr;

/**
 * Pure device resolution (unit-testable).
 * 1. Named device → case-insensitive exact name match (then unique partial)
 * 2. Else exactly one registered device → that one
 * 3. Else the `isDefault` device (if exactly one default)
 * 4. Else actionable ambiguous / empty error
 */
export function resolveTargetDevice(
  devices: GoveeDeviceRow[],
  deviceName?: string | null,
): ResolveTargetResult {
  if (devices.length === 0) {
    return {
      ok: false,
      kind: "empty",
      error:
        "No Govee lights are registered yet — open Settings → Lights to discover devices, then try again.",
    };
  }

  const needle = deviceName?.trim();
  if (needle) {
    const lower = needle.toLowerCase();
    const matches = devices.filter((d) => d.name.toLowerCase() === lower);
    if (matches.length === 1) {
      return { ok: true, device: matches[0]! };
    }
    if (matches.length === 0) {
      const partial = devices.filter((d) => d.name.toLowerCase().includes(lower));
      if (partial.length === 1) {
        return { ok: true, device: partial[0]! };
      }
      const candidates = devices.map((d) => d.name);
      return {
        ok: false,
        kind: "not_found",
        error: `No light named "${needle}". Available: ${candidates.join(", ")}.`,
        candidates,
      };
    }
    return {
      ok: false,
      kind: "ambiguous",
      error: `Multiple lights match "${needle}". Pick one: ${matches.map((d) => d.name).join(", ")}.`,
      candidates: matches.map((d) => d.name),
    };
  }

  if (devices.length === 1) {
    return { ok: true, device: devices[0]! };
  }

  const defaults = devices.filter((d) => d.isDefault);
  if (defaults.length === 1) {
    return { ok: true, device: defaults[0]! };
  }

  const candidates = devices.map((d) => d.name);
  return {
    ok: false,
    kind: "ambiguous",
    error:
      "Which light? Name one (e.g. device: \"Desk\") or set a default in Settings → Lights. Available: " +
      candidates.join(", ") +
      ".",
    candidates,
  };
}

/** Pack RGB channels into Govee's integer color value. */
export function packRgb(red: number, green: number, blue: number): number {
  return ((red & 0xff) << 16) | ((green & 0xff) << 8) | (blue & 0xff);
}
