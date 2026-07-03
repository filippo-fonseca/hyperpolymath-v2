// Canonical, exhaustive list of JARVIS tool names as a runtime value.
//
// `JarvisToolName` (types.ts) is a compile-time union; downstream units that
// must VALIDATE a value at runtime (e.g. the routine block-engine checking that
// an authored block's `tool` is a real tool, or the routine-model editor
// gating tool selection) need the same set as data. This array is the single
// runtime source of truth and is kept exhaustive against `JarvisToolName` via
// the `satisfies` assertion below — adding a tool to the union without adding
// it here (or vice-versa) is a compile error.

import type { JarvisToolName } from "./types";

export const JARVIS_TOOL_NAMES = [
  "create_task",
  "create_capture",
  "create_event",
  "remember_fact",
  "ask_clarification",
  "update_task",
  "delete_task",
  "update_capture",
  "delete_capture",
  "update_event",
  "delete_event",
  "find_tasks",
  "find_captures",
  "find_events",
  "create_person",
  "find_people",
  "link_people",
  "open_url",
  "open_app",
  "web_search",
  "send_message",
  "system_control",
  "type_text",
  "press_key",
  "take_screenshot",
  "run_applescript",
  "run_shortcut",
  "play_music",
  "get_weather",
  "read_gmail",
  "get_news",
  "read_whatsapp",
  "computer_use",
] as const satisfies readonly JarvisToolName[];

// Exhaustiveness in the other direction: if a NEW member is added to the
// `JarvisToolName` union but omitted from the array above, this type errors
// because the omitted literal is not assignable to the array's element union.
type _ExhaustiveCheck = JarvisToolName extends (typeof JARVIS_TOOL_NAMES)[number]
  ? true
  : ["JARVIS_TOOL_NAMES is missing a JarvisToolName member"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustive: _ExhaustiveCheck = true;

/** Runtime membership test — narrows an arbitrary string to JarvisToolName. */
export function isJarvisToolName(name: string): name is JarvisToolName {
  return (JARVIS_TOOL_NAMES as readonly string[]).includes(name);
}
