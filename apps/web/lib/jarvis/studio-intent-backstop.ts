// U1 jarvis-web-brain — deterministic studio-widget backstop.
//
// The model is instructed (tool description + personality prose) to pair an
// answer with the matching Studio widget: weather questions open the weather
// widget, news questions open the news widget. Strict-mode grammar and the
// model's own discretion mean it sometimes answers WITHOUT opening the widget.
// This is a tiny, conservative safety net: given the raw user utterance, if it
// obviously asks for ambient weather or news AND the model did NOT already open
// a widget this turn, we return the widget kind to nudge server-side.
//
// Deliberately narrow — only weather/temperature and news/headlines, the two
// ambient-data intents that map 1:1 to a data widget. Live-web questions
// (scores, prices) are NOT backstopped here: they require a real result URL
// from web_search that only the model has, so forcing a widget blind would
// risk opening the wrong page. Keep the regexes tight to avoid false positives
// on unrelated turns ("remind me to check the weather app tomorrow").

export type StudioBackstopKind = "weather" | "news" | "whatsapp";

// Weather / temperature: an ambient "what's it like out" question.
const WEATHER_RE =
  /\b(what(?:'s| is| s)?\s+(?:the\s+)?(?:temperature|weather)|how\s+(?:hot|cold|warm)\s+is\s+it|temperature\s+(?:outside|today|now)|weather\s+(?:outside|today|like)|is\s+it\s+(?:hot|cold|raining|snowing|sunny)\b)/i;

// News / headlines: an ambient "what's happening" request.
const NEWS_RE =
  /\b(what(?:'s| is| s)?\s+(?:in|the)\s+news|(?:the\s+)?(?:latest\s+)?headlines|what(?:'s| is| s)?\s+(?:happening|going\s+on)\s+(?:in\s+the\s+world|today)|any\s+news\b|catch\s+me\s+up\s+on\s+the\s+news)/i;

// WhatsApp / messages: an explicit "open my messages" request. Matched only on
// an open/show/pull-up verb so we don't fire on incidental mentions ("text her
// on WhatsApp"). "my messages"/"my chats" without a service name also maps here
// since WhatsApp is the HUD's messaging widget.
const WHATSAPP_RE =
  /\b(?:open|show|pull\s+up|bring\s+up|launch|go\s+to|check)\s+(?:my\s+|the\s+)?(?:whats\s?app|messages|chats|texts|dms)\b/i;

/**
 * Given the user's raw utterance and whether the model already opened a studio
 * widget this turn, decide whether to server-side nudge one open. Returns the
 * widget kind to open, or null for "do nothing".
 *
 * Pure and side-effect free so it can be unit-tested in isolation. `alreadyOpened`
 * is true when any `studio_open_widget` tool call fired during the turn — in that
 * case we NEVER nudge (respect the model's choice and avoid duplicate widgets).
 */
export function detectStudioBackstop(
  userText: string,
  alreadyOpened: boolean
): StudioBackstopKind | null {
  if (alreadyOpened) return null;
  if (typeof userText !== "string" || !userText.trim()) return null;
  const text = userText.trim();
  // Weather takes priority: it is the more specific ambient intent.
  if (WEATHER_RE.test(text)) return "weather";
  if (NEWS_RE.test(text)) return "news";
  // WhatsApp: an explicit "open whatsapp / my messages" request. Even if the
  // model wrongly reached for open_app (launching the macOS WhatsApp.app), this
  // nudges the native HUD widget open instead.
  if (WHATSAPP_RE.test(text)) return "whatsapp";
  return null;
}
