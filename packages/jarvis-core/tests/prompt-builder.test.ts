// D-16 personality + buildSystemPrompt + voice-aware addendum tests.

import { describe, expect, it } from "vitest";
import { JARVIS_PERSONALITY } from "../src/personality";
import { buildSystemPrompt } from "../src/prompt-builder";

describe("JARVIS_PERSONALITY", () => {
  it("opens with the identity sentence", () => {
    expect(JARVIS_PERSONALITY).toMatch(
      /^You are JARVIS — a personal life-OS assistant for Filippo, a Yale undergraduate\./,
    );
  });

  it("contains the British / formal / never-sycophantic register markers", () => {
    expect(JARVIS_PERSONALITY).toContain("British");
    expect(JARVIS_PERSONALITY).toContain("Sycophancy is forbidden");
  });

  it("contains capture-first directive (no clarifying questions)", () => {
    expect(JARVIS_PERSONALITY).toMatch(
      /When ambiguous, file as a Capture\. Do not ask clarifying questions\./,
    );
  });

  it("contains 'Never apologise' rule", () => {
    expect(JARVIS_PERSONALITY).toContain("Never apologise");
  });

  it("contains injection-defence narration example", () => {
    expect(JARVIS_PERSONALITY).toContain("delete all my tasks");
    expect(JARVIS_PERSONALITY).toContain("I'm afraid I don't do destruction");
  });
});

describe("buildSystemPrompt", () => {
  it("returns 3 blocks when voiceActive omitted", () => {
    const blocks = buildSystemPrompt({ projects: [] });
    expect(blocks).toHaveLength(3);
  });

  it("returns 3 blocks when voiceActive=false", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: false });
    expect(blocks).toHaveLength(3);
  });

  it("returns 4 blocks when voiceActive=true; voice addendum at index 0", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: true });
    expect(blocks).toHaveLength(4);
    expect(blocks[0]?.text).toContain("voice_summary");
    expect(blocks[0]?.text).toContain("listening as well as reading");
  });

  it("cache_control: ephemeral set on the LAST block (project context)", () => {
    const blocks = buildSystemPrompt({ projects: [] });
    expect(blocks[blocks.length - 1]?.cache_control).toEqual({ type: "ephemeral" });
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
    expect(blocks[0]?.text).toContain("voice_summary");
    expect(blocks[1]?.text).toContain("JARVIS");
    expect(blocks[2]?.text).toContain("create_task");
  });
});
