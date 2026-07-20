import type { GoveeCapability, GoveeDevice, GoveeOption } from "./types";

export interface DeviceSelector {
  deviceId?: string;
  deviceName?: string;
  sku?: string;
}

export function selectDevice(devices: GoveeDevice[], selector: DeviceSelector): GoveeDevice {
  let matches = devices;

  if (selector.deviceId) {
    matches = matches.filter(
      (device) => device.device.toLowerCase() === selector.deviceId?.toLowerCase(),
    );
  } else if (selector.deviceName) {
    matches = matches.filter(
      (device) => device.deviceName?.toLowerCase() === selector.deviceName?.toLowerCase(),
    );
  } else if (selector.sku) {
    matches = matches.filter((device) => device.sku.toLowerCase() === selector.sku?.toLowerCase());
  }

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error("No matching Govee device found. List devices and pick by name or ID.");
  }
  throw new Error(
    `Found ${matches.length} matching devices. Specify deviceId or deviceName to disambiguate.`,
  );
}

export function supports(device: GoveeDevice, type: string, instance: string): boolean {
  return device.capabilities.some(
    (capability) => capability.type === type && capability.instance === instance,
  );
}

export function getCapability(
  capabilities: GoveeCapability[],
  type: string,
  instance: string,
): GoveeCapability | undefined {
  return capabilities.find(
    (capability) => capability.type === type && capability.instance === instance,
  );
}

export function getCapabilityOptions(
  capabilities: GoveeCapability[],
  type: string,
  instance: string,
): GoveeOption[] {
  return getCapability(capabilities, type, instance)?.parameters?.options ?? [];
}

export function findOptionByName<T = unknown>(
  options: GoveeOption<T>[],
  name: string,
): GoveeOption<T> | undefined {
  const normalized = name.toLowerCase();
  return options.find((option) => option.name.toLowerCase() === normalized);
}
