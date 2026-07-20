// list_lights + control_lights — Zod contract + registration.

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/tools";
import {
  ControlLightsInputSchema,
  LightCommandSchema,
} from "../src/tools/control-lights";
import { ListLightsInputSchema } from "../src/tools/list-lights";

describe("ListLightsInputSchema", () => {
  it("accepts empty object", () => {
    expect(ListLightsInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts optional filter", () => {
    expect(ListLightsInputSchema.safeParse({ filter: "desk" }).success).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(ListLightsInputSchema.safeParse({ filter: "x", extra: 1 }).success).toBe(false);
  });
});

describe("LightCommandSchema / ControlLightsInputSchema", () => {
  it("accepts power on/off", () => {
    expect(ControlLightsInputSchema.safeParse({ type: "power", on: true }).success).toBe(true);
    expect(
      ControlLightsInputSchema.safeParse({ type: "power", on: false, device: "Desk" }).success,
    ).toBe(true);
  });

  it("accepts brightness 1–100 and rejects out of range", () => {
    expect(
      ControlLightsInputSchema.safeParse({ type: "brightness", percent: 40 }).success,
    ).toBe(true);
    expect(
      ControlLightsInputSchema.safeParse({ type: "brightness", percent: 0 }).success,
    ).toBe(false);
    expect(
      ControlLightsInputSchema.safeParse({ type: "brightness", percent: 101 }).success,
    ).toBe(false);
  });

  it("accepts color RGB and rejects channel > 255", () => {
    expect(
      ControlLightsInputSchema.safeParse({
        type: "color",
        red: 255,
        green: 0,
        blue: 128,
      }).success,
    ).toBe(true);
    expect(
      ControlLightsInputSchema.safeParse({
        type: "color",
        red: 256,
        green: 0,
        blue: 0,
      }).success,
    ).toBe(false);
  });

  it("accepts temperature / gradient / segments / scene / music / diy", () => {
    expect(
      LightCommandSchema.safeParse({ type: "temperature", kelvin: 4000 }).success,
    ).toBe(true);
    expect(LightCommandSchema.safeParse({ type: "gradient", on: true }).success).toBe(true);
    expect(
      LightCommandSchema.safeParse({
        type: "segmentColor",
        segments: [0, 1],
        red: 10,
        green: 20,
        blue: 30,
      }).success,
    ).toBe(true);
    expect(
      LightCommandSchema.safeParse({
        type: "segmentBrightness",
        segments: [2],
        percent: 0,
      }).success,
    ).toBe(true);
    expect(LightCommandSchema.safeParse({ type: "scene", name: "Sunrise" }).success).toBe(true);
    expect(
      LightCommandSchema.safeParse({
        type: "music",
        mode: 1,
        sensitivity: 50,
        autoColor: true,
      }).success,
    ).toBe(true);
    expect(LightCommandSchema.safeParse({ type: "diy", name: "My DIY" }).success).toBe(true);
  });

  it("rejects unknown command type and unknown fields", () => {
    expect(LightCommandSchema.safeParse({ type: "raw", envelope: {} }).success).toBe(false);
    expect(
      LightCommandSchema.safeParse({ type: "power", on: true, capability: "x" }).success,
    ).toBe(false);
  });
});

describe("buildToolDefinitions — Govee lights", () => {
  it("registers list_lights and control_lights before computer_use", () => {
    const names = buildToolDefinitions().map((t) => t.name);
    expect(names).toContain("list_lights");
    expect(names).toContain("control_lights");
    const iList = names.indexOf("list_lights");
    const iCtrl = names.indexOf("control_lights");
    const iCu = names.indexOf("computer_use");
    expect(iList).toBeLessThan(iCtrl);
    expect(iCtrl).toBeLessThan(iCu);
    expect(names[names.length - 1]).toBe("computer_use");
  });

  it("marks both lights tools non-strict", () => {
    const tools = buildToolDefinitions();
    for (const name of ["list_lights", "control_lights"] as const) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.strict).toBe(false);
      expect(t.input_schema).toBeTruthy();
    }
  });
});
