import type {
  GoveeApiEnvelope,
  GoveeControlCapability,
  GoveeDevice,
  GoveeDeviceState,
  GoveeOption,
  MusicModeValue,
} from "./types";
import { findOptionByName, getCapabilityOptions } from "./device";
import {
  RequestSerializer,
  isNonRetryableStatus,
  parseRetryAfterMs,
  withRetry,
  type RetryOptions,
} from "./rate-limit";

const DEFAULT_BASE_URL = "https://openapi.api.govee.com";
const CONTROL_PATH = "/router/api/v1/device/control";

export interface GoveeClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  retry?: RetryOptions;
}

export interface DeviceReference {
  sku: string;
  device: string;
}

export class GoveeApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "GoveeApiError";
  }
}

export class GoveeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly retryOptions: RetryOptions;
  private readonly controlQueue = new RequestSerializer();

  constructor(options: GoveeClientOptions) {
    if (!options.apiKey.trim()) throw new Error("A Govee API key is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.retryOptions = options.retry ?? {};
  }

  async listDevices(): Promise<GoveeDevice[]> {
    const response = await this.request<GoveeDevice[]>("/router/api/v1/user/devices", {
      method: "GET",
    });
    return response.data ?? response.payload ?? [];
  }

  async getState(device: DeviceReference): Promise<GoveeDeviceState> {
    const response = await this.post<GoveeDeviceState>("/router/api/v1/device/state", device);
    if (!response.payload) throw new GoveeApiError("Govee returned no device state.");
    return response.payload;
  }

  async getScenes(device: DeviceReference): Promise<GoveeDeviceState> {
    const response = await this.post<GoveeDeviceState>("/router/api/v1/device/scenes", device);
    if (!response.payload) throw new GoveeApiError("Govee returned no scenes.");
    return response.payload;
  }

  async listDiyScenes(device: DeviceReference): Promise<GoveeOption<number>[]> {
    const response = await this.post<GoveeDeviceState>("/router/api/v1/device/diy-scenes", device);
    if (!response.payload) throw new GoveeApiError("Govee returned no DIY scenes.");
    return getCapabilityOptions(
      response.payload.capabilities,
      "devices.capabilities.diy_color_setting",
      "diyScene",
    ) as GoveeOption<number>[];
  }

  async control(device: DeviceReference, capability: GoveeControlCapability): Promise<void> {
    await this.controlQueue.run(() =>
      this.postWithRetry(CONTROL_PATH, { ...device, capability }),
    );
  }

  async setPower(device: DeviceReference, on: boolean): Promise<void> {
    await this.control(device, {
      type: "devices.capabilities.on_off",
      instance: "powerSwitch",
      value: on ? 1 : 0,
    });
  }

  async setBrightness(device: DeviceReference, brightness: number): Promise<void> {
    if (!Number.isInteger(brightness) || brightness < 1 || brightness > 100) {
      throw new Error("Brightness must be a whole number from 1 to 100.");
    }
    await this.control(device, {
      type: "devices.capabilities.range",
      instance: "brightness",
      value: brightness,
    });
  }

  async setColor(device: DeviceReference, rgb: number): Promise<void> {
    if (!Number.isInteger(rgb) || rgb < 0 || rgb > 0xffffff) {
      throw new Error("RGB must be an integer from 0x000000 to 0xFFFFFF.");
    }
    await this.control(device, {
      type: "devices.capabilities.color_setting",
      instance: "colorRgb",
      value: rgb,
    });
  }

  async setColorTemperature(device: DeviceReference, kelvin: number): Promise<void> {
    if (!Number.isInteger(kelvin) || kelvin < 2000 || kelvin > 9000) {
      throw new Error("Color temperature must be an integer from 2000 to 9000 Kelvin.");
    }
    await this.control(device, {
      type: "devices.capabilities.color_setting",
      instance: "colorTemperatureK",
      value: kelvin,
    });
  }

  async setGradient(device: DeviceReference, on: boolean): Promise<void> {
    await this.control(device, {
      type: "devices.capabilities.toggle",
      instance: "gradientToggle",
      value: on ? 1 : 0,
    });
  }

  async setSegmentColor(device: DeviceReference, segments: number[], rgb: number): Promise<void> {
    if (segments.length === 0 || segments.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error("Segments must be a comma-separated list of non-negative integers.");
    }
    if (!Number.isInteger(rgb) || rgb < 0 || rgb > 0xffffff) {
      throw new Error("RGB must be an integer from 0x000000 to 0xFFFFFF.");
    }
    await this.control(device, {
      type: "devices.capabilities.segment_color_setting",
      instance: "segmentedColorRgb",
      value: { segment: segments, rgb },
    });
  }

  async setSegmentBrightness(
    device: DeviceReference,
    segments: number[],
    brightness: number,
  ): Promise<void> {
    if (segments.length === 0 || segments.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error("Segments must be a list of non-negative integers.");
    }
    if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
      throw new Error("Segment brightness must be a whole number from 0 to 100.");
    }
    await this.control(device, {
      type: "devices.capabilities.segment_color_setting",
      instance: "segmentedBrightness",
      value: { segment: segments, brightness },
    });
  }

  async setMusicMode(device: DeviceReference, value: MusicModeValue): Promise<void> {
    if (!Number.isInteger(value.musicMode) || value.musicMode < 0) {
      throw new Error("musicMode must be a non-negative integer.");
    }
    if (!Number.isInteger(value.sensitivity) || value.sensitivity < 0 || value.sensitivity > 100) {
      throw new Error("sensitivity must be a whole number from 0 to 100.");
    }
    await this.control(device, {
      type: "devices.capabilities.music_setting",
      instance: "musicMode",
      value,
    });
  }

  async activateScene(device: DeviceReference, sceneName: string): Promise<void> {
    const scenes = await this.getScenes(device);
    const options = getCapabilityOptions(
      scenes.capabilities,
      "devices.capabilities.dynamic_scene",
      "lightScene",
    );
    const scene = findOptionByName(options, sceneName);
    if (!scene) {
      throw new GoveeApiError(`Scene "${sceneName}" not found.`);
    }
    await this.control(device, {
      type: "devices.capabilities.dynamic_scene",
      instance: "lightScene",
      value: scene.value,
    });
  }

  async activateDiy(device: DeviceReference, sceneNameOrValue: string | number): Promise<void> {
    const value =
      typeof sceneNameOrValue === "number"
        ? sceneNameOrValue
        : await this.resolveDiySceneValue(device, sceneNameOrValue);
    await this.control(device, {
      type: "devices.capabilities.diy_color_setting",
      instance: "diyScene",
      value,
    });
  }

  private async resolveDiySceneValue(device: DeviceReference, sceneName: string): Promise<number> {
    const options = await this.listDiyScenes(device);
    const scene = findOptionByName(options, sceneName);
    if (!scene) {
      throw new GoveeApiError(`DIY scene "${sceneName}" not found.`);
    }
    if (typeof scene.value !== "number") {
      throw new GoveeApiError(`DIY scene "${sceneName}" has an unsupported value shape.`);
    }
    return scene.value;
  }

  private async post<T>(path: string, payload: unknown): Promise<GoveeApiEnvelope<T>> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify({ requestId: crypto.randomUUID(), payload }),
    });
  }

  private async postWithRetry<T>(path: string, payload: unknown): Promise<GoveeApiEnvelope<T>> {
    return withRetry(
      async () =>
        this.request<T>(path, {
          method: "POST",
          body: JSON.stringify({ requestId: crypto.randomUUID(), payload }),
        }),
      {
        retryOptions: this.retryOptions,
        shouldRetry: (error) => this.shouldRetryControlError(error),
        getRetryAfterMs: (error) =>
          error instanceof GoveeApiError ? error.retryAfterMs : undefined,
      },
    );
  }

  private shouldRetryControlError(error: unknown): boolean {
    if (!(error instanceof GoveeApiError)) return false;
    if (isNonRetryableStatus(error.status)) return false;
    return error.status === 429 || error.code === 429;
  }

  private async request<T>(path: string, init: RequestInit): Promise<GoveeApiEnvelope<T>> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "Govee-API-Key": this.apiKey,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new GoveeApiError(
        `Could not reach Govee: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const raw = await response.text();
    let body: GoveeApiEnvelope<T>;
    try {
      body = JSON.parse(raw) as GoveeApiEnvelope<T>;
    } catch {
      throw new GoveeApiError(
        `Govee returned an invalid response (${response.status}).`,
        response.status,
      );
    }

    if (!response.ok || body.code !== 200) {
      const message = body.message ?? body.msg ?? `Request failed with status ${response.status}`;
      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      throw new GoveeApiError(
        `Govee API: ${message}`,
        response.status,
        body.code,
        retryAfterMs,
      );
    }
    return body;
  }
}
