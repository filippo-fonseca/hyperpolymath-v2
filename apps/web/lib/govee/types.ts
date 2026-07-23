export interface GoveeRange {
  min: number;
  max: number;
  precision?: number;
}

export interface GoveeOption<T = unknown> {
  name: string;
  value: T;
}

export interface GoveeParameters {
  dataType?: string;
  range?: GoveeRange;
  options?: GoveeOption[];
  fields?: unknown[];
  [key: string]: unknown;
}

export interface GoveeCapability {
  type: string;
  instance: string;
  parameters?: GoveeParameters;
  state?: { value: unknown };
}

export interface GoveeDevice {
  sku: string;
  device: string;
  deviceName?: string;
  type?: string;
  capabilities: GoveeCapability[];
}

export interface GoveeDeviceState {
  sku: string;
  device: string;
  capabilities: GoveeCapability[];
}

export interface GoveeControlCapability {
  type: string;
  instance: string;
  value: unknown;
}

export interface GoveeApiEnvelope<T> {
  requestId?: string;
  code: number;
  message?: string;
  msg?: string;
  data?: T;
  payload?: T;
}

/** Govee `devices.capabilities.music_setting` / `musicMode` struct value. */
export interface MusicModeValue {
  musicMode: number;
  sensitivity: number;
  autoColor?: number;
  rgb?: number;
}
