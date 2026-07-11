import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const StudioWidgetKindSchema = z.enum(["browser", "whatsapp", "weather", "news"]);

export const StudioOpenWidgetInputSchema = z
  .object({
    kind: StudioWidgetKindSchema,
    url: z.string().url().optional(),
  })
  .strict()
  .refine((value) => value.kind !== "browser" || typeof value.url === "string", {
    message: "url is required when kind is browser",
  });

export const StudioCloseWidgetInputSchema = z
  .object({
    kind: StudioWidgetKindSchema.optional(),
    all: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.all === true || value.kind !== undefined, {
    message: "provide kind or set all=true",
  });

export const studioOpenWidgetTool = {
  name: "studio_open_widget" as const,
  description:
    "Materialize a widget inside the Studio canvas. Prefer this over open_url when the user says 'pull up a website', 'show me this on screen', or asks to open a browser/WhatsApp/weather/news widget. For browser, pass the full URL. The broadcast is safe if Studio is closed; report that the request was sent, not that a visible window is guaranteed.",
  input_schema: toJsonSchema(StudioOpenWidgetInputSchema),
};

export const studioCloseWidgetTool = {
  name: "studio_close_widget" as const,
  description:
    "Request that the open Studio close widgets. Pass kind to close every widget of that kind, or all=true to clear the floating canvas. Use for 'close the weather widget', 'dismiss that browser', or 'clear the screen'. Safe when Studio is not open.",
  input_schema: toJsonSchema(StudioCloseWidgetInputSchema),
};
