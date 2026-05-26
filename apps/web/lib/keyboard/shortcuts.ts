export type ShortcutSection = "Global" | "Tasks" | "Editing";

export interface Shortcut {
  id: string;
  keys: string[];
  description: string;
  section: ShortcutSection;
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "jarvis.focus",
    keys: ["⌘", "K"],
    description: "Focus JARVIS agent input",
    section: "Global",
  },
  {
    id: "capture.open",
    keys: ["⌘", "⇧", "K"],
    description: "Open capture composer",
    section: "Global",
  },
  {
    id: "help.open",
    keys: ["?"],
    description: "Show keyboard shortcuts",
    section: "Global",
  },
  {
    id: "panel.close",
    keys: ["Esc"],
    description: "Close detail panel or dialog",
    section: "Global",
  },
  {
    id: "form.submit",
    keys: ["⌘", "↵"],
    description: "Save / submit in detail panels",
    section: "Editing",
  },
  {
    id: "form.cancel",
    keys: ["Esc"],
    description: "Cancel inline edit",
    section: "Editing",
  },
];

export function groupShortcuts(
  list: readonly Shortcut[] = SHORTCUTS,
): Record<ShortcutSection, Shortcut[]> {
  const out: Record<ShortcutSection, Shortcut[]> = {
    Global: [],
    Tasks: [],
    Editing: [],
  };
  for (const s of list) out[s.section].push(s);
  return out;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
