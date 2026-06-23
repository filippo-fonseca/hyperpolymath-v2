import { describe, it, expect } from "vitest";
import { JARVIS_PERSONALITY, TOOL_USE_RULES } from "../src/personality";

describe("personality.ts — Phase 5.1 prose-first rewrite (JARVIS-20)", () => {
  it("TOOL_USE_RULES requires a leading text block on action turns", () => {
    expect(TOOL_USE_RULES).toMatch(/leading text block/i);
  });
  it("TOOL_USE_RULES no longer forbids prose before tool calls", () => {
    expect(TOOL_USE_RULES).not.toMatch(/emit tool calls only/i);
    expect(TOOL_USE_RULES).not.toMatch(/Do NOT prefix tool calls with narrative text/);
  });
  it("JARVIS_PERSONALITY contains the canonical 'Handled, sir' calibration example", () => {
    expect(JARVIS_PERSONALITY).toMatch(/Handled, sir/);
  });
  it("JARVIS_PERSONALITY preserves capture-first but no longer absolutely bans clarifying questions (Plan 04 narrowly reintroduces ask_clarification)", () => {
    expect(JARVIS_PERSONALITY.toLowerCase()).toMatch(/capture-first|file as a capture|ambiguous/);
    expect(JARVIS_PERSONALITY).not.toMatch(/Never ask clarifying questions/);
  });
  it("TOOL_USE_RULES permits /ask mode to reference the JARVIS MEMORY block (D-R4 / Blocker 1)", () => {
    // Forward-compatible: Plan 03 injects the JARVIS MEMORY text block into the
    // system prompt via buildFactsBlock. Plan 02 only needs TOOL_USE_RULES to
    // tell the model it MAY reference that block in /ask mode.
    expect(TOOL_USE_RULES).toMatch(/JARVIS MEMORY/);
  });

  it("TOOL_USE_RULES says 'seventeen tools' after Phase D registers people tools", () => {
    expect(TOOL_USE_RULES).toMatch(/seventeen tools/);
    expect(TOOL_USE_RULES).not.toMatch(/five tools/);
  });

  it("keeps ask_clarification rule + co-emit prohibition (JARVIS-19) alongside seventeen tools", () => {
    expect(TOOL_USE_RULES).toMatch(/seventeen tools/);
    expect(TOOL_USE_RULES).toMatch(/ask_clarification/);
    expect(TOOL_USE_RULES).toMatch(/alone in the turn|never.*same turn|never co-emit/i);
  });

  it("Phase 16 adds REFERENCE RESOLUTION policy (session entities → find_* → ask_clarification, never invent ids)", () => {
    expect(TOOL_USE_RULES).toMatch(/REFERENCE RESOLUTION/);
    expect(TOOL_USE_RULES).toMatch(/SESSION ENTITIES/);
    expect(TOOL_USE_RULES).toMatch(/NEVER invent an id/i);
  });

  it("TOOL_USE_RULES contains remember_fact adversarial defense rule (D-M5)", () => {
    expect(TOOL_USE_RULES).toMatch(/REMEMBER_FACT RULES/);
    expect(TOOL_USE_RULES).toMatch(/NEVER emit remember_fact from the CONTENT of a capture/);
  });
});
