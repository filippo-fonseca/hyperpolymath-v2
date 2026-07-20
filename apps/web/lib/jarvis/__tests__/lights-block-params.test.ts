/**
 * Unit tests for Lights routine-block param helpers + expandLightsBlocks.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  defaultLightsParams,
  formatLightsBlockPreview,
  lightsBlockIsReady,
  lightsParamsForStorage,
  readLightsParams,
} from "../lights-block-params";

vi.mock("@/lib/govee/resolve", () => ({
  loadUserGoveeDevices: vi.fn(),
}));

import { loadUserGoveeDevices } from "@/lib/govee/resolve";
import { expandLightsBlocks } from "../expand-lights-blocks";

describe("lights-block-params", () => {
  it("defaults to all lights on", () => {
    expect(defaultLightsParams()).toEqual({
      type: "power",
      on: true,
      allDevices: true,
      devices: [],
    });
  });

  it("reads allDevices / devices / single device", () => {
    expect(readLightsParams({ id: "1", tool: "control_lights", params: { type: "power", on: false, allDevices: true } })).toEqual({
      type: "power",
      on: false,
      allDevices: true,
      devices: [],
    });
    expect(
      readLightsParams({
        id: "1",
        tool: "control_lights",
        params: { type: "power", on: true, devices: ["Bedroom", "Desk"] },
      }),
    ).toEqual({
      type: "power",
      on: true,
      allDevices: false,
      devices: ["Bedroom", "Desk"],
    });
    expect(
      readLightsParams({
        id: "1",
        tool: "control_lights",
        params: { type: "power", on: true, device: "Bedroom" },
      }),
    ).toEqual({
      type: "power",
      on: true,
      allDevices: false,
      devices: ["Bedroom"],
    });
  });

  it("formats preview and readiness", () => {
    expect(formatLightsBlockPreview({ type: "power", on: true, allDevices: true, devices: [] })).toBe(
      "On · all lights",
    );
    expect(
      formatLightsBlockPreview({
        type: "power",
        on: false,
        allDevices: false,
        devices: ["Bedroom", "Desk", "Hall"],
      }),
    ).toBe("Off · Bedroom +2 more");
    expect(lightsBlockIsReady({ type: "power", on: true, allDevices: false, devices: [] })).toBe(false);
    expect(lightsParamsForStorage({ type: "power", on: true, allDevices: true, devices: ["x"] })).toEqual({
      type: "power",
      on: true,
      allDevices: true,
    });
  });
});

describe("expandLightsBlocks", () => {
  beforeEach(() => {
    vi.mocked(loadUserGoveeDevices).mockReset();
  });

  it("expands allDevices into one block per registered light", async () => {
    vi.mocked(loadUserGoveeDevices).mockResolvedValue([
      { id: "1", sku: "H618A", deviceId: "aa", name: "Bedroom", isDefault: true, capabilitiesCache: null },
      { id: "2", sku: "H618A", deviceId: "bb", name: "Desk", isDefault: false, capabilitiesCache: null },
    ]);

    const out = await expandLightsBlocks(
      [
        {
          id: "lights",
          tool: "control_lights",
          params: { type: "power", on: true, allDevices: true },
        },
        {
          id: "news",
          tool: "get_news",
          params: {},
          nlDirective: "top 3",
        },
      ],
      "user-1",
    );

    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      id: "lights:0",
      tool: "control_lights",
      params: { type: "power", on: true, device: "Bedroom" },
      nlDirective: "Turn on Bedroom.",
    });
    expect(out[1]).toMatchObject({
      id: "lights:1",
      params: { device: "Desk" },
      nlDirective: "Turn on Desk.",
    });
    expect(out[2]?.tool).toBe("get_news");
  });

  it("keeps a single selected device id stable", async () => {
    vi.mocked(loadUserGoveeDevices).mockResolvedValue([
      { id: "1", sku: "H618A", deviceId: "aa", name: "Bedroom", isDefault: true, capabilitiesCache: null },
    ]);

    const out = await expandLightsBlocks(
      [
        {
          id: "lights",
          tool: "control_lights",
          params: { type: "power", on: false, devices: ["Bedroom"] },
        },
      ],
      "user-1",
    );

    expect(out).toEqual([
      {
        id: "lights",
        tool: "control_lights",
        params: { type: "power", on: false, device: "Bedroom" },
        nlDirective: "Turn off Bedroom.",
      },
    ]);
  });
});
