// D-07: slash-command detector. Default (no slash) = auto-infer (return null).
//
// `/ask` is the meta-question escape hatch: it forces the server to send the
// turn to Claude with `tool_choice: { type: "none" }` so the model replies in
// PROSE rather than emitting a tool call. Use for "what did I just file?",
// "summarise my captures today", etc. — questions about the existing world,
// not new actions to file.

export type SlashCommand = "task" | "capture" | "event" | "ask" | "help";

export interface ParsedSlashCommand {
  command: SlashCommand;
  body: string;
}

const RE = /^\/(task|capture|event|ask|help)(?:\s+([\s\S]*))?$/;

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const m = text.trimStart().match(RE);
  if (!m) return null;
  return {
    command: m[1] as SlashCommand,
    body: (m[2] ?? "").trim(),
  };
}
