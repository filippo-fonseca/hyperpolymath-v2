// Server-side data tool: list_lights
//
// Lists the user's registered Govee lights from `user_govee_devices`. Fully
// server-side — no DesktopAction. Optional `filter` narrows by name substring.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const ListLightsInputSchema = z
  .object({
    filter: z
      .string()
      .optional()
      .describe(
        "Optional case-insensitive name substring to narrow the list (e.g. 'desk', 'bedroom'). Omit to list all registered lights.",
      ),
  })
  .strict();

export type ListLightsInput = z.infer<typeof ListLightsInputSchema>;

export const listLightsTool = {
  name: "list_lights" as const,
  description:
    "List the user's registered Govee lights (name, whether it is the default, sku). Use before controlling lights when the user has multiple devices and has not named one, or when they ask what lights are available. Optional `filter` narrows by name. After listing, prefer control_lights with an explicit `device` name when more than one light exists.",
  input_schema: toJsonSchema(ListLightsInputSchema),
};
