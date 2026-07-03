// Starter routine templates — one-click seeds for the empty state.
//
// Clicking a template opens the editor PRE-FILLED with a fresh deep clone
// (new block ids on every instantiation) so the user can tweak then Save. A
// template does NOT auto-persist; it just demonstrates the trigger + multi-block
// shape so the feature is instantly graspable.

import {
  ROUTINE_SPEC_VERSION,
  type RoutineBlock,
  type RoutineSpec,
} from "@hyperpolymath/jarvis-core";
import type { JarvisToolName } from "@hyperpolymath/jarvis-core";
import type { LucideIcon } from "lucide-react";
import { Sunrise, Moon } from "lucide-react";

/** A block shape without the runtime-generated id (added at instantiate time). */
type SeedBlock = { tool: JarvisToolName; nlDirective: string };

export interface RoutineTemplate {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** A short pitch for the template card. */
  tagline: string;
  triggers: RoutineSpec["triggers"];
  blocks: SeedBlock[];
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    key: "morning-brief",
    name: "Morning Brief",
    description: "Your day, assembled before you're out of bed.",
    icon: Sunrise,
    tagline: "Weather, news, email, and family — every morning at 7.",
    triggers: [{ type: "time", at: "07:00" }],
    blocks: [
      {
        tool: "get_weather",
        nlDirective: "just the essentials, and tell me if i need a jacket",
      },
      {
        tool: "get_news",
        nlDirective: "top 3 world + tech headlines, one line each",
      },
      {
        tool: "read_gmail",
        nlDirective:
          "real people, overnight, unanswered — offer to make tasks",
      },
      {
        tool: "read_whatsapp",
        nlDirective: "anything urgent from family",
      },
    ],
  },
  {
    key: "wind-down",
    name: "Wind Down",
    description: "Close the loop on today, tee up tomorrow.",
    icon: Moon,
    tagline: "Tomorrow's schedule, what's due, and calm music at 9:30.",
    triggers: [{ type: "time", at: "21:30" }],
    blocks: [
      {
        tool: "find_events",
        nlDirective: "tomorrow's schedule, flag any early starts",
      },
      {
        tool: "find_tasks",
        nlDirective: "what's due tomorrow, hardest first",
      },
      {
        tool: "play_music",
        nlDirective: "calm playlist, low volume",
      },
    ],
  },
];

/**
 * Instantiate a template into a concrete RoutineSpec with fresh block ids.
 * Deep-clones triggers so editing the draft never mutates the template.
 */
export function instantiateTemplate(template: RoutineTemplate): {
  name: string;
  description: string;
  spec: RoutineSpec;
} {
  const blocks: RoutineBlock[] = template.blocks.map((b) => ({
    id: crypto.randomUUID(),
    tool: b.tool,
    params: {},
    nlDirective: b.nlDirective,
  }));

  return {
    name: template.name,
    description: template.description,
    spec: {
      version: ROUTINE_SPEC_VERSION,
      triggers: structuredClone(template.triggers),
      blocks,
    },
  };
}
