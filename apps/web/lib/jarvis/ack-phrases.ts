// apps/web/lib/jarvis/ack-phrases.ts
//
// Spoken tool-latency acknowledgements. When the model stops to call a tool with
// no spoken preamble, JARVIS used to go silent for the whole tool round. We emit
// one of these immediately so it speaks right away ("I'll fetch the news for
// you, sir.") — tool-aware where it helps, varied across turns so repeated tool
// questions never get the same canned line.
//
// Pure + deterministic-by-rotation so it's unit-testable and so overlapping
// turns in the same process still vary (the caller passes an incrementing
// rotation counter).

const GENERIC: readonly string[] = [
  "One moment, sir.",
  "Right away, sir.",
  "On it, sir.",
  "Let me see to that, sir.",
  "Just a moment, sir.",
];

// Tool-family phrasings. Keys are matched by prefix so families (find_*, read_*)
// share a pool without enumerating every variant.
const BY_TOOL: Readonly<Record<string, readonly string[]>> = {
  get_news: [
    "I'll fetch the news for you, sir.",
    "Pulling the headlines now, sir.",
    "Let me get the latest news, sir.",
  ],
  get_weather: [
    "Checking the weather for you, sir.",
    "Let me look up the forecast, sir.",
    "One moment while I check the skies, sir.",
  ],
  read_gmail: [
    "Let me check your inbox, sir.",
    "Looking through your email now, sir.",
    "Fetching your mail, sir.",
  ],
  read_whatsapp: [
    "Let me check your messages, sir.",
    "Looking at WhatsApp now, sir.",
  ],
  read_imessage: [
    "Let me check your messages, sir.",
    "Looking through iMessage now, sir.",
  ],
  web_search: [
    "Searching now, sir.",
    "Let me look that up, sir.",
    "One moment while I search, sir.",
  ],
  list_lights: [
    "Checking your lights, sir.",
    "Let me see which lights you have, sir.",
  ],
  control_lights: [
    "Adjusting the lights, sir.",
    "On it — lights, sir.",
    "Setting the lights now, sir.",
  ],
  find_: [
    "Let me look that up, sir.",
    "Searching your records now, sir.",
    "One moment while I find that, sir.",
  ],
  computer_use: [
    "Let me take care of that, sir.",
    "Working on it, sir.",
  ],
};

function poolForTool(toolName: string): readonly string[] {
  if (toolName in BY_TOOL) return BY_TOOL[toolName];
  // Prefix families (e.g. find_tasks / find_captures / find_events).
  for (const key of Object.keys(BY_TOOL)) {
    if (key.endsWith("_") && toolName.startsWith(key)) return BY_TOOL[key];
  }
  return GENERIC;
}

/**
 * Pick a spoken ack line for a tool. `rotation` is a non-negative counter the
 * caller increments each turn so consecutive tool turns vary. Always returns a
 * speech-ready line ending in a period so the sentence splitter and TTS give a
 * natural close before the answer follows.
 */
export function ackPhraseForTool(toolName: string, rotation: number): string {
  const pool = poolForTool(toolName);
  const i = ((Math.trunc(rotation) % pool.length) + pool.length) % pool.length;
  return pool[i];
}
