// Human-readable source labels for routine progress / HUD surfaces. The
// canonical map lives here (jarvis-core is where the tool-name source of truth
// lives) so the web routine editor, mobile, and any future HUD share one set of
// names. The routine-progress bus events ALSO carry the resolved label inline,
// so the desktop HUD renders verbatim without importing this package.

import type { JarvisToolName } from "../types";

/** Explicit human labels for the gather-ish tools; anything unmapped falls back
 * to a prefix-stripped Title Case derivation. */
const SOURCE_LABELS: Partial<Record<JarvisToolName, string>> = {
  get_weather: "Weather",
  read_gmail: "Email",
  get_news: "News",
  read_whatsapp: "WhatsApp",
  find_tasks: "Tasks",
  find_events: "Calendar",
  find_captures: "Captures",
  find_people: "People",
  web_search: "Web",
  play_music: "Music",
  take_screenshot: "Screen",
  computer_use: "Computer",
};

/**
 * "get_weather" → "Weather"; unmapped tools get a prefix-stripped Title Case
 * derivation, e.g. "run_applescript" → "Run Applescript", "read_foo_bar" →
 * "Foo Bar". Accepts a plain string (not JarvisToolName) so skipped
 * unknown-tool blocks still get a sensible label.
 */
export function sourceLabelForTool(tool: string): string {
  const known = SOURCE_LABELS[tool as JarvisToolName];
  if (known) return known;
  return tool
    .replace(/^(get|read|find)_/, "")
    .split("_")
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
