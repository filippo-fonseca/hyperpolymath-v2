// D-16 personality + buildSystemPrompt + voice-aware addendum tests.

import { describe, expect, it } from "vitest";
import { JARVIS_PERSONALITY } from "../src/personality";
import { buildSystemPrompt } from "../src/prompt-builder";

describe("JARVIS_PERSONALITY", () => {
  it("opens with the identity sentence", () => {
    // User-agnostic since the going-public personality rework (name comes from USER CONTEXT block).
    expect(JARVIS_PERSONALITY).toMatch(/^You are JARVIS — a personal life-OS assistant\./);
  });

  it("contains the British / formal / never-sycophantic register markers", () => {
    expect(JARVIS_PERSONALITY).toContain("British");
    expect(JARVIS_PERSONALITY).toContain("Sycophancy is forbidden");
  });

  it("contains capture-first directive (Phase 5.1: no absolutist ban on clarifying questions — Plan 04 narrows via ask_clarification)", () => {
    // Phase 5.1 (D-R3 / JARVIS-20): the old absolutist "Do not ask clarifying questions"
    // rule is removed because Plan 04 narrowly reintroduces ask_clarification.
    // Capture-first remains the default fallback — just not an absolute ban.
    expect(JARVIS_PERSONALITY.toLowerCase()).toMatch(
      /capture-first|file as a capture|ambiguous/,
    );
    expect(JARVIS_PERSONALITY).not.toMatch(/Do not ask clarifying questions\./);
  });

  it("contains 'Never apologise' rule", () => {
    expect(JARVIS_PERSONALITY).toContain("Never apologise");
  });

  it("contains injection-defence narration example", () => {
    expect(JARVIS_PERSONALITY).toContain("delete all my tasks");
    // Phase 5.1: narration wording updated to match new JARVIS voice register
    expect(JARVIS_PERSONALITY).toMatch(/I'm afraid/);
    expect(JARVIS_PERSONALITY).toContain("job description");
  });
});

describe("buildSystemPrompt", () => {
  it("returns 4 blocks when voiceActive omitted (personality, rules, user context, projects)", () => {
    const blocks = buildSystemPrompt({ projects: [] });
    expect(blocks).toHaveLength(4);
  });

  it("returns 4 blocks when voiceActive=false", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: false });
    expect(blocks).toHaveLength(4);
  });

  it("returns 5 blocks when voiceActive=true; voice addendum at index 0", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: true });
    expect(blocks).toHaveLength(5);
    // Phase 5.1: VOICE_ADDENDUM now describes leading text block behavior (not voice_summary fields)
    expect(blocks[0]?.text).toContain("listening as well as reading");
    expect(blocks[0]?.text).toContain("JARVIS would");
  });

  it("cache_control: ephemeral with 1h TTL set on the LAST block (project context)", () => {
    // Phase 11 / CACHE-01 (D-06): tier-2 (frozen system) cache_control upgraded
    // from default 5-min TTL to 1h. ttl: "1h" is required, or warm-cache turns
    // degrade silently back to 5-min coverage.
    const blocks = buildSystemPrompt({ projects: [] });
    expect(blocks[blocks.length - 1]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    // Inner blocks must NOT have cache_control set
    for (let i = 0; i < blocks.length - 1; i++) {
      expect(blocks[i]?.cache_control).toBeUndefined();
    }
  });

  it("renders projects as 'id\\tname' lines sorted by name", () => {
    const blocks = buildSystemPrompt({
      projects: [
        { id: "u1", name: "Zeta" },
        { id: "u2", name: "Alpha" },
      ],
    });
    const ctx = blocks[blocks.length - 1]?.text ?? "";
    const alphaIdx = ctx.indexOf("u2\tAlpha");
    const zetaIdx = ctx.indexOf("u1\tZeta");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(zetaIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeLessThan(zetaIdx);
  });

  it("personality block precedes tool-use rules block", () => {
    const blocks = buildSystemPrompt({ projects: [] });
    // For voiceActive=false: [0]=personality, [1]=tool rules, [2]=projects
    expect(blocks[0]?.text).toContain("JARVIS");
    expect(blocks[1]?.text).toContain("create_task");
  });

  it("voiceActive=true: voice addendum precedes personality block", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: true });
    // [0]=voice, [1]=personality, [2]=tool rules, [3]=projects
    // Phase 5.1: VOICE_ADDENDUM describes leading text block behavior
    expect(blocks[0]?.text).toContain("listening as well as reading");
    expect(blocks[1]?.text).toContain("JARVIS");
    expect(blocks[2]?.text).toContain("create_task");
  });
});
