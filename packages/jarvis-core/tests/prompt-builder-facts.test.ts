// Phase 5.1 (D-M4 / JARVIS-18) — buildSystemPrompt facts-block extension tests.
//
// RED phase: tests for the facts param + buildFactsBlock helper + cache_control move.
//
// After Plan 03 implementation:
//  - buildSystemPrompt accepts `facts?: JarvisFact[]`
//  - When facts is non-empty, emits a 5th system block (facts block) LAST
//    with cache_control: { type: "ephemeral" } AND removes cache_control from
//    the project-list block (new LAST = new cache breakpoint)
//  - When facts is empty or omitted, cache_control stays on projectListContext
//    (backward-compatible — no behavioral change)

import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/prompt-builder";
import type { JarvisFact } from "../src/types";

const SAMPLE_FACTS: JarvisFact[] = [
  { type: "entity", key: "Anna", value: "my partner" },
  { type: "preference", key: "verbosity", value: "be concise" },
];

describe("buildSystemPrompt with facts param", () => {
  it("with facts non-empty: adds a facts block as the LAST block", () => {
    const blocks = buildSystemPrompt({ projects: [], facts: SAMPLE_FACTS });
    // Non-voice: [personality, tool rules, projects, facts] → 4 blocks
    expect(blocks).toHaveLength(4);
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.text).toContain("JARVIS MEMORY");
  });

  it("facts block carries cache_control: ephemeral with 1h TTL (new cache boundary)", () => {
    // Phase 11 / CACHE-01 (D-06): tier-2 frozen system cache now uses 1h TTL.
    const blocks = buildSystemPrompt({ projects: [], facts: SAMPLE_FACTS });
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("project-list block does NOT carry cache_control when facts block is present", () => {
    const blocks = buildSystemPrompt({ projects: [], facts: SAMPLE_FACTS });
    // Last block is facts; second-to-last is projects
    const projectsBlock = blocks[blocks.length - 2]!;
    expect(projectsBlock.text).toContain("USER PROJECTS");
    expect(projectsBlock.cache_control).toBeUndefined();
  });

  it("facts block contains compiled [ENTITY] annotation for entity type", () => {
    const blocks = buildSystemPrompt({
      projects: [],
      facts: [{ type: "entity", key: "Anna", value: "my partner" }],
    });
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.text).toContain("[ENTITY] Anna: my partner");
  });

  it("facts block contains compiled [PREFERENCE] annotation for preference type", () => {
    const blocks = buildSystemPrompt({
      projects: [],
      facts: [{ type: "preference", key: "verbosity", value: "be concise" }],
    });
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.text).toContain("[PREFERENCE] verbosity: be concise");
  });

  it("facts block contains compiled [RULE] annotation for rule type", () => {
    const blocks = buildSystemPrompt({
      projects: [],
      facts: [{ type: "rule", key: "default_calendar", value: "Yale calendar" }],
    });
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.text).toContain("[RULE] default_calendar: Yale calendar");
  });

  it("facts block contains compiled [WORKFLOW] annotation for workflow type", () => {
    const blocks = buildSystemPrompt({
      projects: [],
      facts: [{ type: "workflow", key: "gym", value: "Mon/Wed/Fri 6am" }],
    });
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.text).toContain("[WORKFLOW] gym: Mon/Wed/Fri 6am");
  });

  it("with facts empty array: backward-compatible (1h-TTL cache_control on projectListContext, 3 blocks)", () => {
    // Phase 11 / CACHE-01 (D-06): tier-2 frozen system cache uses 1h TTL
    // regardless of which block ends up last (facts or project-list).
    const blocks = buildSystemPrompt({ projects: [], facts: [] });
    expect(blocks).toHaveLength(3);
    const lastBlock = blocks[blocks.length - 1]!;
    expect(lastBlock.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(lastBlock.text).toContain("USER PROJECTS");
  });

  it("with facts omitted: backward-compatible (same as empty array, 3 blocks, 1h TTL)", () => {
    const blocks = buildSystemPrompt({ projects: [] });
    expect(blocks).toHaveLength(3);
    expect(blocks[blocks.length - 1]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("voiceActive=true + facts: returns 5 blocks [voice, personality, rules, projects, facts] with 1h TTL", () => {
    const blocks = buildSystemPrompt({
      projects: [],
      voiceActive: true,
      facts: SAMPLE_FACTS,
    });
    expect(blocks).toHaveLength(5);
    expect(blocks[0]?.text).toContain("listening as well as reading");
    expect(blocks[blocks.length - 1]?.text).toContain("JARVIS MEMORY");
    expect(blocks[blocks.length - 1]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});
