import { z } from "zod";

export const StudioWidgetKindSchema = z.enum([
  "browser",
  "whatsapp",
  "weather",
  "news",
  "card",
  "clock",
  "camera",
  "settings",
]);

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
      "Materialize a widget inside the Studio HUD canvas. Available widget kinds: browser (a web page — needs a full URL), whatsapp (the user's WhatsApp messages), weather, news, card (a small text/info card for standalone content the user explicitly asked to SEE), clock, camera (the live webcam preview), and settings (the HUD's settings sheet). NEVER open a card as a send/confirmation RECEIPT: after a message send (WhatsApp/iMessage), do NOT open kind:\"card\" to confirm it — the WhatsApp widget IS the receipt (it auto-opens to the chat) and the desktop speaks the true send outcome. Cards are only for content the user asked to be shown, never a redundant \"SENT TO ...\" acknowledgement. PREFER THIS OVER open_app: whenever the user asks to open/show/pull up one of these (e.g. 'open WhatsApp', 'show my messages', 'open the weather', 'pull up the news', 'open the camera', 'show me a clock', 'open settings', 'open <a website>'), ALWAYS use studio_open_widget — it renders the native HUD widget rather than launching a separate macOS app. Use open_app ONLY for apps that have no widget equivalent here (e.g. 'open Spotify', 'launch Figma'). Browser widgets require a full URL. This request is safe when Studio is not connected; report that the request was sent, not that a visible window is guaranteed. ANSWER-AND-SHOW: never open a widget INSTEAD of answering — always do both in the same turn. For a live/current-web question (scores, prices, 'is X winning', latest news on a topic), first call web_search, ANSWER from the results in your reply, AND open kind:\"browser\" on the receipt's top_url (a real article/result page, never a search-engine landing page). For a weather/temperature question, answer the number AND open kind:\"weather\". For a news/headlines question, give the butler read AND open kind:\"news\".",
    input_schema: inputSchema(StudioOpenWidgetInputSchema),
  },
  {
    name: "studio_close_widget" as const,
    description:
      "Close widgets in the Studio canvas. Pass kind to close widgets of that kind, or all=true to clear the canvas. This request is safe when Studio is not connected.",
    input_schema: inputSchema(StudioCloseWidgetInputSchema),
  },
] as const;
