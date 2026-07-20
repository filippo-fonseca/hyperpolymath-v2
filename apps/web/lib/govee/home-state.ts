/**
 * Studio home widget — registered Govee devices with live state.
 *
 * Shared by `/api/studio/home` and any executor path that needs the same
 * envelope without duplicating Govee capability parsing.
 */

import "server-only";

import { getCapability } from "./device";
import { loadUserGoveeDevices, resolveGoveeClient } from "./resolve";
import type { GoveeCapability } from "./types";
import type { ExecutorResult } from "@hyperpolymath/jarvis-core";

export interface HomeLightDevice {
  name: string;
  sku: string;
  deviceId: string;
  isDefault: boolean;
  on: boolean | null;
  brightness: number | null;
  rgb: number | null;
  kelvin: number | null;
  stateError?: string;
}

export interface HomeLightsReceipt {
  devices: HomeLightDevice[];
  count: number;
  connected: boolean;
  hint?: string;
}

function capabilityValue(
  capabilities: GoveeCapability[],
  type: string,
  instance: string,
): unknown {
  return getCapability(capabilities, type, instance)?.state?.value;
}

function parseLightState(
  capabilities: GoveeCapability[],
): Pick<HomeLightDevice, "on" | "brightness" | "rgb" | "kelvin"> {
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
    on: null,
    brightness: null,
    rgb: null,
    kelvin: null,
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

/** Convert a packed Govee RGB integer to a CSS hex color. */
export function rgbToCss(rgb: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(rgb)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}
