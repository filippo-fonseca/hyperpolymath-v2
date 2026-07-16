// Curated capability catalog for the routine block editor.
//
// This is a HAND-WRITTEN, user-facing allowlist over the ~33 raw JARVIS tools
// (see packages/jarvis-core/src/tools/index.ts). We deliberately do NOT dump
// `buildToolDefinitions()` into the picker — most raw tools (computer_use,
// system_control, delete_*, press_key, take_screenshot, …) are not
// routine-appropriate and would make the picker illegible. Instead we surface a
// small set of read/brief-first, then a few safe action tools, each with a
// friendly label, icon, one-line description, and a directive placeholder that
// reads the way Filippo actually types (lowercase, terse).
//
// `tool` is typed as JarvisToolName so the catalog can only ever reference a
// real tool — a typo won't compile. RoutineBlock.tool is the same type.

import type { LucideIcon } from "lucide-react";
import {
  CloudSun,
  Newspaper,
  Mail,
  MessageCircle,
  CheckSquare,
  Calendar,
  Inbox,
  Users,
  Search,
  Music,
  Send,
  Brain,
  AppWindow,
} from "lucide-react";
import type { JarvisToolName } from "@hyperpolymath/jarvis-core";

export interface BlockCatalogEntry {
  tool: JarvisToolName;
  label: string;
  icon: LucideIcon;
  /** One-line, plain-English description shown on the picker card. */
  description: string;
  /** Placeholder for the NL directive textarea — terse, lowercase, real. */
  directivePlaceholder: string;
  /** Optional prefilled directive when a block is first added. */
  defaultDirective?: string;
  /** Loose grouping for the picker layout. */
  group: "brief" | "action";
}

/**
 * The curated allowlist. Order matters — read/brief tools first (what most
 * routines start with), safe action tools second. Destructive / computer-use /
 * system-control tools are intentionally excluded from the MVP picker.
 */
export const BLOCK_CATALOG: BlockCatalogEntry[] = [
  {
    tool: "get_weather",
    label: "Weather",
    icon: CloudSun,
    description: "Today's forecast for your location",
    directivePlaceholder: "just the high, low, and whether i need a jacket",
    group: "brief",
  },
  {
    tool: "get_news",
    label: "News",
    icon: Newspaper,
    description: "A quick scan of the headlines",
    directivePlaceholder: "top 3 world + tech headlines, one line each",
    group: "brief",
  },
  {
    tool: "read_gmail",
    label: "Email",
    icon: Mail,
    description: "Scan your recent inbox",
    directivePlaceholder:
      "real people, overnight, unanswered — offer to make tasks",
    group: "brief",
  },
  {
    tool: "read_whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    description: "Scan your recent chats",
    directivePlaceholder: "anything urgent from family",
    group: "brief",
  },
  {
    tool: "find_tasks",
    label: "Tasks",
    icon: CheckSquare,
    description: "Pull from your task list",
    directivePlaceholder: "what's due today, hardest first",
    group: "brief",
  },
  {
    tool: "find_events",
    label: "Calendar",
    icon: Calendar,
    description: "Look at your schedule",
    directivePlaceholder: "my meetings today with the gaps called out",
    group: "brief",
  },
  {
    tool: "find_captures",
    label: "Captures",
    icon: Inbox,
    description: "Sweep your quick captures",
    directivePlaceholder: "anything i dumped yesterday that needs a home",
    group: "brief",
  },
  {
    tool: "find_people",
    label: "People",
    icon: Users,
    description: "Look someone up",
    directivePlaceholder: "who i'm meeting today and what i last noted",
    group: "brief",
  },
  {
    tool: "web_search",
    label: "Web search",
    icon: Search,
    description: "Look something up on the web",
    directivePlaceholder: "latest on <topic>, cite the sources",
    group: "brief",
  },
  {
    tool: "remember_fact",
    label: "Remember",
    icon: Brain,
    description: "Have JARVIS note something for later",
    directivePlaceholder: "note that i restart the fast at 7pm today",
    group: "action",
  },
  {
    tool: "play_music",
    label: "Music",
    icon: Music,
    description: "Start some playback",
    directivePlaceholder: "my focus playlist, low volume",
    group: "action",
  },
  {
    tool: "send_message",
    label: "Send message",
    icon: Send,
    description: "Send a message on your behalf",
    directivePlaceholder: "text mom 'heading out now'",
    group: "action",
  },
  {
    // Workspace launcher — the block's params list carries the apps/URLs, so
    // there is no NL directive. The BlockEditor hides the directive textarea
    // for this tool and renders a rows editor instead.
    tool: "open_workspace",
    label: "Launch workspace",
    icon: AppWindow,
    description: "Open a set of apps and sites on run",
    directivePlaceholder: "",
    group: "action",
  },
];

const CATALOG_BY_TOOL = new Map<JarvisToolName, BlockCatalogEntry>(
  BLOCK_CATALOG.map((e) => [e.tool, e]),
);

/**
 * Resolve a tool name to its catalog entry. A block may reference a tool that
 * is no longer in the curated set (e.g. authored elsewhere, or catalog trimmed
 * later) — callers must handle `undefined` and fall back to the raw tool name.
 */
export function catalogEntry(
  tool: JarvisToolName,
): BlockCatalogEntry | undefined {
  return CATALOG_BY_TOOL.get(tool);
}
