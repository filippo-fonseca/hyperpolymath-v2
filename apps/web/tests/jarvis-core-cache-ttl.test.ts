/**
 * Phase 11 / CACHE-01 — regression gate for the 1h TTL placement on
 * BOTH cached tiers (tools last + system last).
 *
 * Mirrors Phase 9 TEL-03's "structural" stability test (sibling guard at
 * tests/jarvis-prompt-stability.test.ts) but tightens the assertion:
 * not only must the cache_control marker live on the last block — its
 * `ttl` field must equal "1h", or warm-cache turns degrade silently
 * from 1h coverage back to 5min.
 */
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type SystemBlock,
} from "@hyperpolymath/jarvis-core";

describe("CACHE-01 — tools last carries cache_control with ttl: \"1h\"", () => {
  it("ask_clarification (the LAST tool) carries { type: 'ephemeral', ttl: '1h' }", () => {
    const tools = buildToolDefinitions({ voiceActive: false });
    const last = tools[tools.length - 1];
    expect(last.name).toBe("ask_clarification");
    expect(last.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("NO other tool carries cache_control (single breakpoint invariant)", () => {
    const tools = buildToolDefinitions({ voiceActive: false });
    const withCacheControl = tools.filter((t) => t.cache_control !== undefined);
    expect(withCacheControl).toHaveLength(1);
    expect(withCacheControl[0].name).toBe("ask_clarification");
  });

  it("voiceActive=true preserves the same placement", () => {
    const tools = buildToolDefinitions({ voiceActive: true });
    const last = tools[tools.length - 1];
    expect(last.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});

describe("CACHE-01 — system last carries cache_control with ttl: \"1h\"", () => {
  const projectsFixture = [
    { id: "proj-aaa", name: "Alpha", icon: null },
    { id: "proj-bbb", name: "Beta", icon: null },
  ];

  it("with facts: last block (facts) carries { type: 'ephemeral', ttl: '1h' }", () => {
    const blocks = buildSystemPrompt({
      projects: projectsFixture,
      facts: [{ id: "f1", type: "preference", key: "tone", value: "concise" }] as never,
    });
    const last = blocks[blocks.length - 1] as SystemBlock;
    expect(last.text).toContain("JARVIS MEMORY");
    expect(last.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("without facts: last block (project-list) carries { type: 'ephemeral', ttl: '1h' }", () => {
    const blocks = buildSystemPrompt({
      projects: projectsFixture,
      facts: [],
    });
    const last = blocks[blocks.length - 1] as SystemBlock;
    expect(last.text).toContain("USER PROJECTS");
    expect(last.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("NO non-last block carries cache_control (single breakpoint invariant)", () => {
    const blocks = buildSystemPrompt({ projects: projectsFixture, facts: [] });
    const head = blocks.slice(0, -1);
    const withCacheControl = head.filter((b) => b.cache_control !== undefined);
    expect(withCacheControl).toHaveLength(0);
  });

  it("buildSystemPrompt is deterministic (Phase 5/5.1 invariant)", () => {
    const a = buildSystemPrompt({ projects: projectsFixture, facts: [] });
    const b = buildSystemPrompt({ projects: projectsFixture, facts: [] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
