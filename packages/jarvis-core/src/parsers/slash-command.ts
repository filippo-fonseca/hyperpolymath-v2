// D-07: slash-command detector. Default (no slash) = auto-infer (return null).

export type SlashCommand = "task" | "capture" | "event" | "help";

export interface ParsedSlashCommand {
  command: SlashCommand;
  body: string;
}

const RE = /^\/(task|capture|event|help)(?:\s+([\s\S]*))?$/;

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const m = text.trimStart().match(RE);
  if (!m) return null;
  return {
    command: m[1] as SlashCommand,
    body: (m[2] ?? "").trim(),
  };
}
