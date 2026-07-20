/**
 * Routine "Lights" block params — authored in the BlockEditor picker, expanded
 * at run time into one `control_lights` call per target device.
 *
 * Stored shape (not the raw ControlLights tool schema):
 *   { type: "power", on: boolean, allDevices?: true, devices?: string[] }
 *
 * - `allDevices: true` → every registered Govee light at run time
 * - otherwise `devices` is a list of friendly nicknames from Settings
 */

import type { RoutineBlock } from "@hyperpolymath/jarvis-core";

export interface LightsBlockParams {
  type: "power";
  on: boolean;
  /** When true, expand to every registered light at run time. */
  allDevices: boolean;
  /** Friendly nicknames when not targeting all devices. */
  devices: string[];
}

export function defaultLightsParams(): LightsBlockParams {
  return { type: "power", on: true, allDevices: true, devices: [] };
}

/**
 * Defensively read persisted params back into the editor shape.
 * Accepts a single-device `device` string (post-expand / hand-authored) too.
 */
export function readLightsParams(block?: RoutineBlock): LightsBlockParams {
  const raw = block?.params ?? {};
  const on = raw["on"] === false ? false : true;
  if (raw["allDevices"] === true) {
    return { type: "power", on, allDevices: true, devices: [] };
  }
  if (typeof raw["device"] === "string" && raw["device"].trim().length > 0) {
    return {
      type: "power",
      on,
      allDevices: false,
      devices: [raw["device"].trim()],
    };
  }
  const devicesRaw = raw["devices"];
  const devices: string[] = [];
  if (Array.isArray(devicesRaw)) {
    for (const d of devicesRaw) {
      if (typeof d === "string" && d.trim().length > 0) devices.push(d.trim());
    }
  }
  if (devices.length > 0) {
    return { type: "power", on, allDevices: false, devices };
  }
  // Fresh / empty → default to all lights on.
  return defaultLightsParams();
}

/** Persist editor state into RoutineBlock.params (pre-expand). */
export function lightsParamsForStorage(params: LightsBlockParams): Record<string, unknown> {
  if (params.allDevices) {
    return { type: "power", on: params.on, allDevices: true };
  }
  return {
    type: "power",
    on: params.on,
    devices: [...params.devices],
  };
}

export function lightsBlockIsReady(params: LightsBlockParams): boolean {
  return params.allDevices || params.devices.length > 0;
}

/** One-line preview for BlockCard. */
export function formatLightsBlockPreview(params: LightsBlockParams): string {
  const power = params.on ? "On" : "Off";
  if (params.allDevices) return `${power} · all lights`;
  if (params.devices.length === 0) return power;
  if (params.devices.length === 1) return `${power} · ${params.devices[0]}`;
  if (params.devices.length === 2) {
    return `${power} · ${params.devices[0]}, ${params.devices[1]}`;
  }
  return `${power} · ${params.devices[0]} +${params.devices.length - 1} more`;
}

export function lightsDirectiveForDevice(on: boolean, deviceName: string): string {
  return on ? `Turn on ${deviceName}.` : `Turn off ${deviceName}.`;
}
