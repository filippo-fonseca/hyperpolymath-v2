// System-prompt builder for the JARVIS Anthropic call.
//
// Returns an array of text blocks compatible with Anthropic's `system` field
// (array shape, with cache_control breakpoints). The LAST block ALWAYS
// carries `cache_control: { type: "ephemeral" }` to mark the cache
// boundary — Anthropic caches everything before the breakpoint within the
// system section (research §1.3).
//
// `voiceActive` is Phase 7 forward-compat: when true, a fourth block is
// prepended ahead of the personality with voice-aware addendum copy. Plan
// 05-01 always passes false (or omits); Phase 7 flips it on.

import {
  JARVIS_PERSONALITY,
  TOOL_USE_RULES,
  VOICE_ADDENDUM,
} from "./personality";
import type { ProjectSummary } from "./types";

export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export function buildProjectListContext(projects: ProjectSummary[]): string {
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  const lines = sorted.map((p) => `${p.id}\t${p.name}`);
  return `USER PROJECTS (id\tname):\n${lines.join("\n")}\n\nWhen the user references a project by name, emit its UUID as project_id. If the name does not match exactly, file as a capture and preserve the literal text.`;
}

export function buildSystemPrompt(opts: {
  projects: ProjectSummary[];
  voiceActive?: boolean;
}): SystemBlock[] {
  const blocks: SystemBlock[] = [];
  if (opts.voiceActive) {
    blocks.push({ type: "text", text: VOICE_ADDENDUM });
  }
  blocks.push({ type: "text", text: JARVIS_PERSONALITY });
  blocks.push({ type: "text", text: TOOL_USE_RULES });
  blocks.push({
    type: "text",
    text: buildProjectListContext(opts.projects),
    cache_control: { type: "ephemeral" },
  });
  return blocks;
}
