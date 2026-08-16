/**
 * Phase 9 / TEL-03 — STRUCTURAL prompt-cache regression guard.
 *
 * The Anthropic prompt cache requires byte-identical prefixes across
 * back-to-back turns to hit. The most common regression class is a
 * silent invalidator inside the cached prefix: Date.now(), random IDs,
 * unsorted JSON.stringify over a Set/Map, non-deterministic tool order.
 * These don't change user-visible behavior — they just halve our cache
 * hit rate and tank latency.
 *
 * This test calls the two builders from packages/jarvis-core TWICE with
 * identical inputs and asserts byte-identical output. If a future PR
 * sneaks a Date.now() into prompt-builder.ts or randomizes tool order
 * in tools/index.ts, this test FAILS at the source, immediately.
 *
 * This is the FIRST line of defense for TEL-03. The live-mode test in
 * jarvis-cache-hit.test.ts is the END-TO-END line of defense (catches
 * regressions inside the SDK request body itself).
 *
 * Audit checklist: .planning/research/speed-agility/05-context-priming.md §8
 */
import { describe, expect, it } from "vitest";

// @hyperpolymath/jarvis-core re-exports buildSystemPrompt + buildToolDefinitions
// from its main barrel (packages/jarvis-core/src/index.ts). The package is a
// workspace dependency of apps/web (see apps/web/package.json), so this import
// resolves at build time without any extra path-alias plumbing.
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type JarvisFact,
} from "@hyperpolymath/jarvis-core";

// Deterministic fixture — no Date, no random, no env vars. The whole
// point of this test is that GIVEN these inputs, OUTPUT must be stable.
const FIXTURE_PROJECTS = [
  { id: "proj-1", name: "Hyperpolymath v2" },
  { id: "proj-2", name: "CS 458" },
  { id: "proj-3", name: "Reading" },
] as const;

// Phase 5.1 JarvisFact shape: { type, key, value } only — id/source are
// server-side and stripped before injection into the cached system prompt
// (see packages/jarvis-core/src/types.ts). Use real type literals so the
// fixture exercises the same code path as production.
const FIXTURE_FACTS: JarvisFact[] = [
  { type: "preference", key: "tone", value: "concise" },
  { type: "workflow", key: "default_calendar", value: "Yale" },
];

const AUDIT_HINT =
  "TEL-03 STRUCTURAL REGRESSION: byte-identical output broken. " +
  "A silent prompt-cache invalidator has been introduced into " +
  "packages/jarvis-core. Audit per " +
  ".planning/research/speed-agility/05-context-priming.md §8 — look for " +
  "Date.now(), new Date(), Math.random(), crypto.randomUUID(), unsorted " +
  "JSON.stringify over Set/Map, or non-deterministic tool order inside " +
  "buildSystemPrompt() or buildToolDefinitions().";

describe("TEL-03 — buildSystemPrompt byte-identity (structural-identity / prompt-stability)", () => {
  it("returns byte-identical output across two successive identical calls (voiceActive=false)", () => {
    const opts = {
      projects: [...FIXTURE_PROJECTS],
      voiceActive: false,
      facts: [...FIXTURE_FACTS],
    };
    const call1 = buildSystemPrompt(opts);
    const call2 = buildSystemPrompt(opts);
    expect(JSON.stringify(call1), AUDIT_HINT).toBe(JSON.stringify(call2));
  });

  it("returns byte-identical output across two successive identical calls (voiceActive=true)", () => {
    const opts = {
      projects: [...FIXTURE_PROJECTS],
      voiceActive: true,
      facts: [...FIXTURE_FACTS],
    };
    const call1 = buildSystemPrompt(opts);
    const call2 = buildSystemPrompt(opts);
    expect(JSON.stringify(call1), AUDIT_HINT).toBe(JSON.stringify(call2));
  });

  it("returns byte-identical output with no facts (empty array)", () => {
    const opts = {
      projects: [...FIXTURE_PROJECTS],
      voiceActive: false,
      facts: [],
    };
    const call1 = buildSystemPrompt(opts);
    const call2 = buildSystemPrompt(opts);
    expect(JSON.stringify(call1), AUDIT_HINT).toBe(JSON.stringify(call2));
  });
});

describe("TEL-03 — buildToolDefinitions byte-identity (structural-identity / prompt-stability)", () => {
  it("returns byte-identical output across two successive identical calls (voiceActive=false)", () => {
    const call1 = buildToolDefinitions({ voiceActive: false });
    const call2 = buildToolDefinitions({ voiceActive: false });
    expect(JSON.stringify(call1), AUDIT_HINT).toBe(JSON.stringify(call2));
  });

  it("returns byte-identical output across two successive identical calls (voiceActive=true)", () => {
    const call1 = buildToolDefinitions({ voiceActive: true });
    const call2 = buildToolDefinitions({ voiceActive: true });
    expect(JSON.stringify(call1), AUDIT_HINT).toBe(JSON.stringify(call2));
  });

  it("returns tools in stable order (cache_control breakpoint with 1h TTL on the LAST tool)", () => {
    const tools = buildToolDefinitions({ voiceActive: false });
    const names = tools.map((t) => t.name);
    // Snapshot the canonical order. If this ever changes, the prompt cache
    // invalidates — make sure it's intentional.
    //
    // This snapshot had been pinned at the original five tools since Phase 11
    // and was therefore failing continuously, which meant the guard was doing
    // nothing: a permanently red test cannot tell you that an order change was
    // unintentional. Refreshed to the real list when the study-review tools
    // landed (issue #400). Append new tools BEFORE computer_use, which is the
    // catch-all and must stay last so it keeps the cache breakpoint.
    expect(names).toEqual([
      "create_task",
      "create_capture",
      "create_event",
      "remember_fact",
      "ask_clarification",
      "update_task",
      "update_capture",
      "update_event",
      "delete_task",
      "delete_capture",
      "delete_event",
      "find_tasks",
      "find_captures",
      "find_events",
      "create_person",
      "find_people",
      "link_people",
      "open_url",
      "open_app",
      "open_workspace",
      "web_search",
      "send_message",
      "system_control",
      "type_text",
      "press_key",
      "take_screenshot",
      "run_applescript",
      "run_shortcut",
      "play_music",
      "get_weather",
      "read_gmail",
      "get_news",
      "read_whatsapp",
      "read_imessage",
      "list_lights",
      "control_lights",
      "create_study_topics",
      "find_study_topics",
      "log_study_review",
      "plan_study_day",
      "computer_use",
    ]);
    // The cache_control breakpoint MUST live on the LAST tool. Phase 11 /
    // CACHE-01 (D-06 BREAKPOINT 1): TTL is "1h" so the tools tier amortizes
    // the 2× write cost over a full hour of turns.
    expect(tools[tools.length - 1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});
