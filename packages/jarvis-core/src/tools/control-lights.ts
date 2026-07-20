// Server-side control tool: control_lights
//
// Drives a registered Govee light via a Zod-validated LightCommand.
// Never accept raw Govee capability envelopes from the model — only these
// command shapes. Device resolution (name / single / default) is server-side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.
//
// Anthropic requires `input_schema.type === "object"`. Zod's
// `discriminatedUnion` emits `oneOf` without a top-level `type`, which 400s
// the Messages API (`tools.N.custom.input_schema.type: Field required`).
// So the *tool* schema is a flat object; runtime still re-validates with the
// discriminated LightCommandSchema.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

const deviceField = z
  .string()
  .optional()
  .describe(
    "Friendly light name from list_lights / Settings (case-insensitive). Omit only when the user has exactly one registered light or a clear default.",
  );

const rgbChannel = z
  .number()
  .int()
  .min(0)
  .max(255)
  .describe("RGB channel 0–255.");

const LightPowerCommand = z
  .object({
    type: z.literal("power"),
    on: z.boolean().describe("true = on, false = off"),
    device: deviceField,
  })
  .strict();

const LightBrightnessCommand = z
  .object({
    type: z.literal("brightness"),
    percent: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe("Brightness percent 1–100."),
    device: deviceField,
  })
  .strict();

const LightColorCommand = z
  .object({
    type: z.literal("color"),
    red: rgbChannel,
    green: rgbChannel,
    blue: rgbChannel,
    device: deviceField,
  })
  .strict();

const LightTemperatureCommand = z
  .object({
    type: z.literal("temperature"),
    kelvin: z
      .number()
      .int()
      .min(2000)
      .max(9000)
      .describe("Color temperature in Kelvin (2000–9000)."),
    device: deviceField,
  })
  .strict();

const LightGradientCommand = z
  .object({
    type: z.literal("gradient"),
    on: z.boolean().describe("true = enable gradient, false = disable"),
    device: deviceField,
  })
  .strict();

const LightSegmentColorCommand = z
  .object({
    type: z.literal("segmentColor"),
    segments: z
      .array(z.number().int().min(0))
      .min(1)
      .describe(
        "1-based or 0-based segment indices as returned by the device (non-negative integers).",
      ),
    red: rgbChannel,
    green: rgbChannel,
    blue: rgbChannel,
    device: deviceField,
  })
  .strict();

const LightSegmentBrightnessCommand = z
  .object({
    type: z.literal("segmentBrightness"),
    segments: z
      .array(z.number().int().min(0))
      .min(1)
      .describe("Segment indices (non-negative integers)."),
    percent: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Segment brightness percent 0–100."),
    device: deviceField,
  })
  .strict();

const LightSceneCommand = z
  .object({
    type: z.literal("scene"),
    name: z
      .string()
      .min(1)
      .describe("Scene name as reported by Govee (matched case-insensitively)."),
    device: deviceField,
  })
  .strict();

const LightMusicCommand = z
  .object({
    type: z.literal("music"),
    mode: z
      .number()
      .int()
      .min(0)
      .describe("Govee musicMode option value (integer)."),
    sensitivity: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Mic sensitivity 0–100."),
    autoColor: z
      .boolean()
      .optional()
      .describe("When true, Govee picks colors automatically."),
    red: rgbChannel.optional(),
    green: rgbChannel.optional(),
    blue: rgbChannel.optional(),
    device: deviceField,
  })
  .strict();

const LightDiyCommand = z
  .object({
    type: z.literal("diy"),
    name: z
      .string()
      .min(1)
      .describe("DIY scene name as reported by Govee (matched case-insensitively)."),
    device: deviceField,
  })
  .strict();

/** Discriminated LightCommand — reject unknown fields / types via Zod. */
export const LightCommandSchema = z.discriminatedUnion("type", [
  LightPowerCommand,
  LightBrightnessCommand,
  LightColorCommand,
  LightTemperatureCommand,
  LightGradientCommand,
  LightSegmentColorCommand,
  LightSegmentBrightnessCommand,
  LightSceneCommand,
  LightMusicCommand,
  LightDiyCommand,
]);

export type LightCommand = z.infer<typeof LightCommandSchema>;

const LIGHT_COMMAND_TYPES = [
  "power",
  "brightness",
  "color",
  "temperature",
  "gradient",
  "segmentColor",
  "segmentBrightness",
  "scene",
  "music",
  "diy",
] as const;

/**
 * Flat object schema for the Anthropic tool definition (must emit
 * `type: "object"`). Runtime validation still goes through LightCommandSchema.
 */
export const ControlLightsInputSchema = z
  .object({
    type: z
      .enum(LIGHT_COMMAND_TYPES)
      .describe(
        "Command kind: power, brightness, color, temperature, gradient, segmentColor, segmentBrightness, scene, music, or diy.",
      ),
    on: z
      .boolean()
      .optional()
      .describe("For power/gradient: true = on, false = off."),
    percent: z
      .number()
      .int()
      .optional()
      .describe("Brightness percent (whole-strip 1–100 or segment 0–100)."),
    red: rgbChannel.optional(),
    green: rgbChannel.optional(),
    blue: rgbChannel.optional(),
    kelvin: z
      .number()
      .int()
      .optional()
      .describe("Color temperature in Kelvin (2000–9000)."),
    segments: z
      .array(z.number().int().min(0))
      .min(1)
      .optional()
      .describe("Segment indices for segmentColor / segmentBrightness."),
    name: z
      .string()
      .min(1)
      .optional()
      .describe("Scene or DIY name (matched case-insensitively)."),
    mode: z
      .number()
      .int()
      .optional()
      .describe("Govee musicMode option value."),
    sensitivity: z
      .number()
      .int()
      .optional()
      .describe("Music mic sensitivity 0–100."),
    autoColor: z
      .boolean()
      .optional()
      .describe("Music mode: auto color when true."),
    device: deviceField,
  })
  .strict()
  .superRefine((value, ctx) => {
    const cleaned = Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined),
    );
    const parsed = LightCommandSchema.safeParse(cleaned);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: issue.path,
        });
      }
    }
  });

export type ControlLightsInput = z.infer<typeof ControlLightsInputSchema>;

export const controlLightsTool = {
  name: "control_lights" as const,
  description:
    "Control a registered Govee light. Pass a discriminated `type` command: power, brightness (1–100), color (RGB 0–255), temperature (Kelvin 2000–9000), gradient, segmentColor, segmentBrightness, scene (by name), music, or diy (by name). Include `device` with the friendly name when the user has more than one light; omit only for the single/default light. Use list_lights first if the target is ambiguous. Never invent raw Govee capability envelopes.",
  input_schema: toJsonSchema(ControlLightsInputSchema),
};
