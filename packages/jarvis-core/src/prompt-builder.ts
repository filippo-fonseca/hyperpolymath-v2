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
//
// Phase 5.1 (D-M4 / JARVIS-18): `facts` param added. When non-empty, a new
// JARVIS MEMORY block is appended as the LAST system block with
// cache_control: { type: "ephemeral" }. The project-list block then loses
// cache_control (it's no longer the last block). When facts is empty or
// omitted, cache_control stays on the project-list block — backward-
// compatible, no behavioral change.

import {
  JARVIS_PERSONALITY,
  TOOL_USE_RULES,
  VOICE_ADDENDUM,
} from "./personality";
import type { JarvisFact, ProjectSummary } from "./types";

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

/**
 * Compile a JarvisFact array into the JARVIS MEMORY text block.
 *
 * Format (one line per fact):
 *   [TYPE_UPPER] key: value
 *
 * Grouped by type for readability, but a flat list is fine for the model —
 * at single-user scale (<200 facts lifetime) the whole block fits in context.
 */
export function buildFactsBlock(facts: JarvisFact[]): string {
  const lines: string[] = [];
  for (const fact of facts) {
    const typeLabel = fact.type.toUpperCase();
    lines.push(`[${typeLabel}] ${fact.key}: ${fact.value}`);
  }
  return `JARVIS MEMORY (persistent facts about the user — honour these in every turn):\n${lines.join("\n")}`;
}

export function buildSystemPrompt(opts: {
  projects: ProjectSummary[];
  voiceActive?: boolean;
  /** Phase 5.1 (D-M4): compiled facts for the JARVIS MEMORY block. */
  facts?: JarvisFact[];
}): SystemBlock[] {
  const blocks: SystemBlock[] = [];
  if (opts.voiceActive) {
    blocks.push({ type: "text", text: VOICE_ADDENDUM });
  }
  blocks.push({ type: "text", text: JARVIS_PERSONALITY });
  blocks.push({ type: "text", text: TOOL_USE_RULES });

  const hasFacts = opts.facts && opts.facts.length > 0;

  // Project-list block: carries cache_control ONLY when there's no facts block
  // following it (backward-compatible: if facts is empty/omitted, this stays LAST).
  blocks.push({
    type: "text",
    text: buildProjectListContext(opts.projects),
    ...(hasFacts ? {} : { cache_control: { type: "ephemeral" } }),
  });

  // Facts block (D-M4): appended LAST when present, carrying the cache breakpoint.
  if (hasFacts) {
    blocks.push({
      type: "text",
      text: buildFactsBlock(opts.facts!),
      cache_control: { type: "ephemeral" },
    });
  }

  return blocks;
}
