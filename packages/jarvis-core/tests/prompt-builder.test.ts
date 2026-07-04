// D-16 personality + buildSystemPrompt + voice-aware addendum tests.

import { describe, expect, it } from "vitest";
import { COMPUTER_MODE_ADDENDUM, JARVIS_PERSONALITY } from "../src/personality";
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

  it("returns 5 blocks when voiceActive=true; SPOKEN-OUTPUT CONTRACT at index 1 (right after personality)", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: true });
    expect(blocks).toHaveLength(5);
    // The contract is now load-bearing: injected right AFTER the personality
    // (index 1), not before it. Index 0 stays the personality.
    expect(blocks[0]?.text).toContain("JARVIS");
    expect(blocks[1]?.text).toContain("SPOKEN-OUTPUT CONTRACT");
  });

  it("voiceActive=true: SPOKEN-OUTPUT CONTRACT carries the no-markdown + interpret rules (Unit 1 regression gate)", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: true });
    const contract = blocks[1]?.text ?? "";
    // No-markdown hard rule.
    expect(contract).toContain("PLAIN SPOKEN PROSE ONLY");
    expect(contract).toContain("Never emit markdown");
    // Interpret-don't-recite.
    expect(contract).toContain("INTERPRET, DON'T RECITE");
    // Length caps + one-question rule.
    expect(contract).toContain("2-3 sentences per data source");
    expect(contract).toContain("ONE QUESTION PER TURN");
    expect(contract).toContain("Never restate");
    // The contract must NOT be present when the turn is not spoken.
    const textOnly = buildSystemPrompt({ projects: [], voiceActive: false });
    expect(textOnly.some((b) => b.text.includes("SPOKEN-OUTPUT CONTRACT"))).toBe(false);
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

  it("voiceActive=true: SPOKEN-OUTPUT CONTRACT sits between personality and tool rules", () => {
    const blocks = buildSystemPrompt({ projects: [], voiceActive: true });
    // [0]=personality, [1]=SPOKEN-OUTPUT CONTRACT, [2]=tool rules, [3]=user ctx, [4]=projects
    expect(blocks[0]?.text).toContain("JARVIS");
    expect(blocks[1]?.text).toContain("SPOKEN-OUTPUT CONTRACT");
    expect(blocks[2]?.text).toContain("create_task");
  });

  // Phase 2 (Task 2.1 / 2.3) — computer-control mode steering.
  describe("mode: 'computer'", () => {
    it("omitting mode does NOT include the COMPUTER-CONTROL MODE addendum", () => {
      const blocks = buildSystemPrompt({ projects: [] });
      const joined = blocks.map((b) => b.text).join("\n");
      expect(joined).not.toContain("COMPUTER-CONTROL MODE");
      expect(blocks).toHaveLength(4);
    });

    it("mode='computer' appends the addendum as an extra trailing block", () => {
      const base = buildSystemPrompt({ projects: [] });
      const withMode = buildSystemPrompt({ projects: [], mode: "computer" });
      expect(withMode).toHaveLength(base.length + 1);
      expect(withMode[withMode.length - 1]?.text).toBe(COMPUTER_MODE_ADDENDUM);
      expect(withMode[withMode.length - 1]?.text).toContain("COMPUTER-CONTROL MODE");
    });

    it("addendum steers toward computer actions and away from filing", () => {
      expect(COMPUTER_MODE_ADDENDUM).toContain("open_url");
      expect(COMPUTER_MODE_ADDENDUM).toContain("open_app");
      expect(COMPUTER_MODE_ADDENDUM).toContain("web_search");
      expect(COMPUTER_MODE_ADDENDUM).toMatch(/do NOT create tasks|Do NOT create tasks/i);
    });

    it("addendum carries the destructive-action confirm guardrail (Task 2.3)", () => {
      expect(COMPUTER_MODE_ADDENDUM).toMatch(/destructive/i);
      expect(COMPUTER_MODE_ADDENDUM).toContain("confirm");
    });

    it("the addendum block is UNCACHED — the 1h cache breakpoint stays on the block before it", () => {
      const blocks = buildSystemPrompt({ projects: [], mode: "computer" });
      // Trailing (mode) block must NOT carry cache_control — appended after the
      // breakpoint so it never invalidates the cached prefix (RESEARCH Q3).
      const last = blocks[blocks.length - 1];
      expect(last?.cache_control).toBeUndefined();
      // The block immediately before it still owns the 1h ephemeral breakpoint.
      const breakpoint = blocks[blocks.length - 2];
      expect(breakpoint?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    });

    // Clicky slice — persistent preference learning (PREFERENCE MEMORY rules).
    describe("PREFERENCE MEMORY rules", () => {
      it("carves the sole exception out of the no-filing rule", () => {
        expect(COMPUTER_MODE_ADDENDUM).toContain("sole exception: PREFERENCE MEMORY");
      });

      it("instructs silent same-turn remember_fact capture with type preference / source user_explicit", () => {
        expect(COMPUTER_MODE_ADDENDUM).toContain("PREFERENCE MEMORY");
        expect(COMPUTER_MODE_ADDENDUM).toContain("remember_fact");
        expect(COMPUTER_MODE_ADDENDUM).toContain('type "preference"');
        expect(COMPUTER_MODE_ADDENDUM).toContain('source "user_explicit"');
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/never ask permission/i);
      });

      it("defines the normalized key convention so the UNIQUE(user_id,type,key) upsert dedupes", () => {
        expect(COMPUTER_MODE_ADDENDUM).toContain("message channel: <contact first name>");
        expect(COMPUTER_MODE_ADDENDUM).toContain('"music app"');
        expect(COMPUTER_MODE_ADDENDUM).toContain('"default browser"');
        expect(COMPUTER_MODE_ADDENDUM).toContain('"maps app"');
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/IDENTICAL lowercase key/);
      });

      it("carries the overwrite-on-update rule (same key, new value)", () => {
        expect(COMPUTER_MODE_ADDENDUM).toContain("OVERWRITES");
        expect(COMPUTER_MODE_ADDENDUM).toContain("SAME key");
      });

      it("instructs recall from JARVIS MEMORY before ask_clarification when a detail is omitted", () => {
        expect(COMPUTER_MODE_ADDENDUM).toContain("JARVIS MEMORY [PREFERENCE]");
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/without asking/i);
        expect(COMPUTER_MODE_ADDENDUM).toMatch(
          /Only ask_clarification when no remembered preference/i,
        );
      });

      it("routes WhatsApp AND iMessage through send_message (never screen-driving) and keeps the send confirm guardrail", () => {
        // WhatsApp is fully supported by send_message — the model must NOT be
        // told to screen-drive it via computer_use (that was a false claim).
        expect(COMPUTER_MODE_ADDENDUM).not.toMatch(/not supported by send_message/i);
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/both are fully supported by send_message/i);
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/NEVER screen-drive a messaging app/i);
        expect(COMPUTER_MODE_ADDENDUM).toMatch(
          /readback-and-confirm guardrail applies to EVERY outgoing message/i,
        );
      });

      it("excludes one-offs and keeps the adversarial-defense rules in force", () => {
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/do NOT store one-offs/i);
        expect(COMPUTER_MODE_ADDENDUM).toMatch(/never from content being filed/i);
      });
    });

    it("facts + mode='computer': JARVIS MEMORY precedes the addendum; breakpoint stays on facts", () => {
      // Recall path (cross-session): remembered preferences must be IN context
      // on computer-mode turns — facts block (cached, 1h) then addendum (uncached).
      const blocks = buildSystemPrompt({
        projects: [],
        facts: [{ type: "preference", key: "music app", value: "spotify" }],
        mode: "computer",
      });
      const last = blocks[blocks.length - 1]!;
      const factsBlock = blocks[blocks.length - 2]!;
      expect(last.text).toContain("COMPUTER-CONTROL MODE");
      expect(last.cache_control).toBeUndefined();
      expect(factsBlock.text).toContain("[PREFERENCE] music app: spotify");
      expect(factsBlock.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    });
  });
});
