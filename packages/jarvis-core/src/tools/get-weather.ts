// Server-side data tool: get_weather
//
// UNLIKE the other computer-control tools, this one runs FULLY server-side:
// the executor fetches Open-Meteo (free, keyless) and returns the weather in
// the tool result for the agent to narrate. No DesktopAction is emitted.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const GetWeatherInputSchema = z
  .object({
    location: z
      .string()
      .optional()
      .describe(
        "City name, e.g. 'Boston' or 'San José, Costa Rica'. Omit to use the user's default location.",
      ),
  })
  .strict();

export type GetWeatherInput = z.infer<typeof GetWeatherInputSchema>;

export const getWeatherTool = {
  name: "get_weather" as const,
  description:
    "Get the current weather (temperature, condition, wind) for a location. Returns data to narrate aloud in one crisp butler sentence — temperature in the user's preferred unit, the condition, and anything worth flagging. Omit `location` for the user's default city.",
  input_schema: toJsonSchema(GetWeatherInputSchema),
};
