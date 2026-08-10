// Composer parse chain (slash → $projects → #hashtags → dates → priority),
// ported from src/lib/input-payload.ts with the project context re-pointed
// at the v2 jarvis API client.

import {
  parseDates,
  parsePriority,
  parseSlashCommand,
  type ParsedDate,
  type Priority,
  type SlashCommand,
} from "@hyperpolymath/jarvis-core/parsers";

import type { ProjectRef } from "@/api/jarvis";

export interface MobileJarvisPayload {
  /** What the user sees in their bubble (slash prefix stripped). */
  displayText: string;
  input: string;
  parsedDates: ParsedDate[];
  parsedPriority: Priority | null;
  slashCommand: Exclude<SlashCommand, "help"> | null;
  /** Local-only: render the help card, never hits the server. */
  isHelp: boolean;
  hashtags: string[];
  projectIds: string[];
}

const PRIORITY_TOKEN_RE = /\b(ptop|p0|p1|p2|p3)\b/i;
const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
const PROJECT_TOKEN_RE = /\$([\p{L}\p{N}_]+)/gu;

/** Normalize a project name for $token matching ("Deep Work" → "deepwork"). */
export function projectTokenName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, "");
}

export function buildMobileJarvisPayload(
  rawText: string,
  userTimezone: string,
  projects: ProjectRef[],
  slashCommandOverride: SlashCommand | null,
): MobileJarvisPayload | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0 && !slashCommandOverride) return null;

  // 1. Slash command — pinned override, or auto-detect.
  let slashCommand: SlashCommand | null = slashCommandOverride;
  let inputText = trimmed;
  if (slashCommand === null) {
    const slashParsed = parseSlashCommand(trimmed);
    if (slashParsed) {
      slashCommand = slashParsed.command;
      inputText = slashParsed.body;
    }
  } else {
    inputText = trimmed.replace(/^\/\S*\s*/, "");
  }

  if (slashCommand === "help") {
    return {
      displayText: "/help",
      input: "",
      parsedDates: [],
      parsedPriority: null,
      slashCommand: null,
      isHelp: true,
      hashtags: [],
      projectIds: [],
    };
  }
  if (inputText.length === 0) return null;

  // 2. $project tokens → canonical project UUIDs via the cached list.
  const projectIds: string[] = [];
  for (const m of inputText.matchAll(PROJECT_TOKEN_RE)) {
    const token = m[1]?.toLowerCase();
    if (!token) continue;
    const match = projects.find((p) => projectTokenName(p.name) === token);
    if (match && !projectIds.includes(match.id)) projectIds.push(match.id);
  }

  // 3. Permissive #hashtag scan (same regex as web).
  const hashtags: string[] = [];
  for (const m of inputText.matchAll(HASHTAG_RE)) {
    const tag = m[1]?.toLowerCase();
    if (tag && !hashtags.includes(tag)) hashtags.push(tag);
  }

  // 4. Date pre-parse — chrono → TZDate → UTC ISO.
  const parsedDates = parseDates(inputText, userTimezone);

  // 5. Priority — only when an explicit token is present (parsePriority
  //    defaults to P3; forwarding that on every turn would override the
  //    model's discretion).
  const parsedPriority: Priority | null = PRIORITY_TOKEN_RE.test(inputText)
    ? parsePriority(inputText)
    : null;

  return {
    displayText: inputText,
    input: inputText,
    parsedDates,
    parsedPriority,
    slashCommand: slashCommand as Exclude<SlashCommand, "help"> | null,
    isHelp: false,
    hashtags,
    projectIds,
  };
}
