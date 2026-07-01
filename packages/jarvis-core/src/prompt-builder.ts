// CACHE-CRITICAL FILE — see CACHE-05 grep gate allowlist.
// NO time-of-day reads (Date now, new-Date, toISOString) or unsorted JSON
// stringify allowed — any such call invalidates the 1h cache. Per-line
// CACHE-OK: <reason> escape honored but must be justified.
//
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
//
// Phase 11 (CACHE-01 / D-06): the LAST block's cache_control upgrades to
// { type: "ephemeral", ttl: "1h" } so tier 2 (frozen system) caches for
// 1 hour instead of the 5-min default. The new snapshot block (tier 3)
// is appended at the route boundary (NOT here) and uses default 5-min.
// Three breakpoints total: tools (last) + system (this block) at 1h,
// snapshot at 5m. See apps/web/app/api/jarvis/route.ts.

import {
  COMPUTER_MODE_ADDENDUM,
  JARVIS_PERSONALITY,
  TOOL_USE_RULES,
  VOICE_ADDENDUM,
} from "./personality";
import type { JarvisFact, ProjectSummary } from "./types";

export interface SystemBlock {
  type: "text";
  text: string;
  // Phase 11 / CACHE-01: ttl widened to "5m" | "1h". Anthropic SDK
  // accepts an optional ttl on ephemeral cache_control; default is "5m".
  // Setting "1h" requires the `extended-cache-ttl-2025-04-11` beta header
  // on the messages.stream call (wired at the route boundary, see
  // apps/web/app/api/jarvis/route.ts Plan 11-04).
  cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" };
}

/**
 * Per-user context block — preferred name + address rule.
 *
 * Kept short and stable so it sits inside the tier-2 (1h) cached system blocks
 * without invalidating the cache often. Names rarely change.
 *
 * When `displayName` is null/empty, we emit a generic block (still useful as a
 * deterministic marker; falls back to "sir" address).
 */
export function buildUserContextBlock(displayName: string | null | undefined): string {
  const name = displayName?.trim();
  if (!name) {
    return `USER CONTEXT:\nThe user has not set a preferred name. Address them as "sir" by default.`;
  }
  return `USER CONTEXT:\nThe user's preferred name is "${name}". Address them as "sir" by default, or use their name sparingly (e.g. as a single direct address per turn, never repeatedly).`;
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
  /**
   * Multi-user (2026-06): the user's preferred name (from users.display_name).
   * Threaded into a USER CONTEXT block so JARVIS_PERSONALITY can stay
   * user-agnostic + shareable across users at the prefix-cache level.
   * Pass null/undefined for users who haven't set a name yet.
   */
  userDisplayName?: string | null;
  /**
   * Phase 2 (Task 2.1): computer-control steering for desktop turns carrying
   * `X-Jarvis-Mode: computer`. When "computer", a short COMPUTER-CONTROL MODE
   * block is appended AFTER the cached prefix blocks (so it never invalidates
   * the 1h prompt cache) to bias toward open_url/open_app/web_search + direct
   * answers and away from filing. The full tool list + tool_choice:"auto" are
   * unchanged. Omit (or any other value) for browser/mobile turns — no change.
   */
  mode?: "computer";
}): SystemBlock[] {
  const blocks: SystemBlock[] = [];
  if (opts.voiceActive) {
    blocks.push({ type: "text", text: VOICE_ADDENDUM });
  }
  blocks.push({ type: "text", text: JARVIS_PERSONALITY });
  blocks.push({ type: "text", text: TOOL_USE_RULES });
  blocks.push({ type: "text", text: buildUserContextBlock(opts.userDisplayName) });

  const hasFacts = opts.facts && opts.facts.length > 0;

  // Project-list block: carries cache_control ONLY when there's no facts block
  // following it (backward-compatible: if facts is empty/omitted, this stays LAST).
  blocks.push({
    type: "text",
    text: buildProjectListContext(opts.projects),
    ...(hasFacts ? {} : { cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }),
  });

  // Facts block (D-M4): appended LAST when present, carrying the cache breakpoint.
  if (hasFacts) {
    blocks.push({
      type: "text",
      text: buildFactsBlock(opts.facts!),
      cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
    });
  }

  // Computer-control mode block (Phase 2): appended AFTER the cache breakpoint
  // (no cache_control) so it never invalidates the cached prefix. Volatile-mode
  // blocks belong after the breakpoint per RESEARCH Q3.
  if (opts.mode === "computer") {
    blocks.push({ type: "text", text: COMPUTER_MODE_ADDENDUM });
  }

  return blocks;
}
