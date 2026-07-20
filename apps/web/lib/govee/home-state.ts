/**
 * Studio home widget — registered Govee devices with live state.
 *
 * Shared by `/api/studio/home` and any executor path that needs the same
 * envelope without duplicating Govee capability parsing.
 */

import "server-only";

import { getCapability } from "./device";
import { rgbToCss, type HomeLightDeviceView, type HomeLightsReceiptView } from "./home-display";
import { loadUserGoveeDevices, resolveGoveeClient } from "./resolve";
import type { GoveeCapability } from "./types";
import type { ExecutorResult } from "@hyperpolymath/jarvis-core";

export type HomeLightDevice = HomeLightDeviceView;
export type HomeLightsReceipt = HomeLightsReceiptView;
export { rgbToCss };

function capabilityValue(
  capabilities: GoveeCapability[],
  type: string,
  instance: string,
): unknown {
  return getCapability(capabilities, type, instance)?.state?.value;
}

function formatModeLabel(
  value: unknown,
  kind: "scene" | "music" | "diy" | "snapshot",
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim()) return `${kind}: ${value.trim()}`;
  if (typeof value === "number" && Number.isFinite(value)) return `${kind} #${value}`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name =
      (typeof record.name === "string" && record.name) ||
      (typeof record.sceneName === "string" && record.sceneName) ||
      null;
    if (name) return `${kind}: ${name}`;
    if (typeof record.id === "number" || typeof record.id === "string") {
      return `${kind} #${record.id}`;
    }
    if (typeof record.paramId === "number" || typeof record.paramId === "string") {
      return `${kind} #${record.paramId}`;
    }
  }
  return null;
}

function parseMode(capabilities: GoveeCapability[]): string | null {
  const candidates: Array<{
    type: string;
    instance: string;
    kind: "scene" | "music" | "diy" | "snapshot";
  }> = [
    { type: "devices.capabilities.dynamic_scene", instance: "lightScene", kind: "scene" },
    { type: "devices.capabilities.diy_color_setting", instance: "diyScene", kind: "diy" },
    { type: "devices.capabilities.dynamic_scene", instance: "snapshot", kind: "snapshot" },
    { type: "devices.capabilities.music_setting", instance: "musicMode", kind: "music" },
  ];
  for (const candidate of candidates) {
    const raw = capabilityValue(capabilities, candidate.type, candidate.instance);
    const label = formatModeLabel(raw, candidate.kind);
    if (label) return label;
  }
  const music = capabilityValue(
    capabilities,
    "devices.capabilities.music_setting",
    "musicMode",
  );
  if (music && typeof music === "object" && music !== null) {
    const mode = (music as { musicMode?: unknown }).musicMode;
    if (typeof mode === "number") return `music #${mode}`;
  }
  return null;
}

function parseLightState(
  capabilities: GoveeCapability[],
): Pick<HomeLightDevice, "on" | "brightness" | "rgb" | "kelvin" | "mode"> {
  const power = capabilityValue(capabilities, "devices.capabilities.on_off", "powerSwitch");
  const brightness = capabilityValue(capabilities, "devices.capabilities.range", "brightness");
  const rgb = capabilityValue(capabilities, "devices.capabilities.color_setting", "colorRgb");
  const kelvin = capabilityValue(
    capabilities,
    "devices.capabilities.color_setting",
    "colorTemperatureK",
  );

  return {
    on: power === 1 ? true : power === 0 ? false : null,
    brightness: typeof brightness === "number" ? brightness : null,
    rgb: typeof rgb === "number" ? rgb : null,
    kelvin: typeof kelvin === "number" ? kelvin : null,
    mode: parseMode(capabilities),
  };
}

/** Fetch registered lights and their current Govee state for the Studio HUD. */
export async function fetchHomeLightsState(userId: string): Promise<ExecutorResult> {
  const registered = await loadUserGoveeDevices(userId);

  if (registered.length === 0) {
    return {
      ok: true,
      id: "home_lights:0",
      receipt: {
        devices: [],
        count: 0,
        connected: false,
        hint: "No lights registered — open Settings → Lights to discover devices.",
      } satisfies HomeLightsReceipt,
    };
  }

  const client = await resolveGoveeClient(userId);
  const offlineBase = registered.map((device) => ({
    name: device.name,
    sku: device.sku,
    deviceId: device.deviceId,
    isDefault: device.isDefault,
    on: null as boolean | null,
    brightness: null as number | null,
    rgb: null as number | null,
    kelvin: null as number | null,
    mode: null as string | null,
  }));

  if (!client) {
    return {
      ok: true,
      id: "home_lights:no_key",
      receipt: {
        devices: offlineBase,
        count: offlineBase.length,
        connected: false,
        hint:
          "No Govee API key configured — add one in Settings (developer.govee.com) or set GOVEE_API_KEY.",
      } satisfies HomeLightsReceipt,
    };
  }

  const devices = await Promise.all(
    registered.map(async (device): Promise<HomeLightDevice> => {
      const base = {
        name: device.name,
        sku: device.sku,
        deviceId: device.deviceId,
        isDefault: device.isDefault,
      };
      try {
        const state = await client.getState({ sku: device.sku, device: device.deviceId });
        return { ...base, ...parseLightState(state.capabilities) };
      } catch (err) {
        return {
          ...base,
          on: null,
          brightness: null,
          rgb: null,
          kelvin: null,
          mode: null,
          stateError: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return {
    ok: true,
    id: `home_lights:${devices.length}`,
    receipt: {
      devices,
      count: devices.length,
      connected: true,
    } satisfies HomeLightsReceipt,
  };
}
