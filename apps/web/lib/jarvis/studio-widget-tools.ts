import { z } from "zod";

export const StudioWidgetKindSchema = z.enum(["browser", "whatsapp", "weather", "news"]);

export const StudioOpenWidgetInputSchema = z
  .object({
    kind: StudioWidgetKindSchema,
    url: z.string().url().optional(),
  })
  .strict()
  .refine((value) => value.kind !== "browser" || value.url !== undefined, {
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

export type StudioOpenWidgetInput = z.infer<typeof StudioOpenWidgetInputSchema>;
export type StudioCloseWidgetInput = z.infer<typeof StudioCloseWidgetInputSchema>;

function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: "openapi-3.1",
  }) as Record<string, unknown>;
  json.additionalProperties = false;
  return json;
}

export const STUDIO_WIDGET_TOOL_DEFINITIONS = [
  {
    name: "studio_open_widget" as const,
    description:
      "Materialize a widget inside the Studio canvas. Use this when the user asks to show or open a browser, WhatsApp, weather, or news widget. Browser widgets require a full URL. This request is safe when Studio is not connected; report that the request was sent, not that a visible window is guaranteed. ANSWER-AND-SHOW: never open a widget INSTEAD of answering — always do both in the same turn. For a live/current-web question (scores, prices, 'is X winning', latest news on a topic), first call web_search, ANSWER from the results in your reply, AND open kind:\"browser\" on the receipt's top_url (a real article/result page, never a search-engine landing page). For a weather/temperature question, answer the number AND open kind:\"weather\". For a news/headlines question, give the butler read AND open kind:\"news\".",
    input_schema: inputSchema(StudioOpenWidgetInputSchema),
  },
  {
    name: "studio_close_widget" as const,
    description:
      "Close widgets in the Studio canvas. Pass kind to close widgets of that kind, or all=true to clear the canvas. This request is safe when Studio is not connected.",
    input_schema: inputSchema(StudioCloseWidgetInputSchema),
  },
] as const;
