import { Mic, MessageSquare, Clock, Keyboard, type LucideIcon } from "lucide-react";
import type { RoutineTrigger, RoutineTriggerType } from "@hyperpolymath/jarvis-core";

export interface TriggerTypeMeta {
  type: RoutineTriggerType;
  label: string;
  icon: LucideIcon;
  /** Short helper describing when this fires. */
  hint: string;
}

export const TRIGGER_TYPES: TriggerTypeMeta[] = [
  {
    type: "wake",
    label: "Wake phrase",
    icon: Mic,
    hint: "Say a phrase like “Daddy's Home” to fire it.",
  },
  {
    type: "utterance",
    label: "When I say",
    icon: MessageSquare,
    hint: "Fires when JARVIS hears a phrase mid-conversation.",
  },
  {
    type: "time",
    label: "Daily at",
    icon: Clock,
    hint: "Runs every day at a set time.",
  },
  {
    type: "hotkey",
    label: "Hotkey",
    icon: Keyboard,
    hint: "Fires on your paired desktop when you press the combo.",
  },
];

export function triggerMeta(type: RoutineTriggerType): TriggerTypeMeta {
  return TRIGGER_TYPES.find((t) => t.type === type) ?? TRIGGER_TYPES[0]!;
}

/** Human-readable value for a trigger, e.g. `07:00` or `⌘⇧J` or the phrase. */
export function triggerValue(trigger: RoutineTrigger): string {
  switch (trigger.type) {
    case "wake":
      return `“${trigger.phrase}”`;
    case "utterance":
      return `“${trigger.match}”`;
    case "time":
      return trigger.at;
    case "hotkey":
      return prettyAccelerator(trigger.accelerator);
  }
}

/** Turn a canonical accelerator ("Cmd+Shift+J") into glyphs ("⌘⇧J"). */
export function prettyAccelerator(accelerator: string): string {
  const map: Record<string, string> = {
    Cmd: "⌘",
    Command: "⌘",
    Ctrl: "⌃",
    Control: "⌃",
    Shift: "⇧",
    Alt: "⌥",
    Option: "⌥",
  };
  return accelerator
    .split("+")
    .map((part) => map[part] ?? part.toUpperCase())
    .join("");
}
