import { describe, it, expect } from "vitest";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";

describe("stripSystemTags", () => {
  it("strips leading [CLARIFICATION REPLY] prefix", () => {
    expect(stripSystemTags("[CLARIFICATION REPLY] Task: plan weekend")).toBe(
      "Task: plan weekend",
    );
  });

  it("strips [SYSTEM-PARSED PRIORITY ...] tag mid-text", () => {
    expect(
      stripSystemTags(
        '[SYSTEM-PARSED PRIORITY — Set create_task.priority to exactly "P∞"] Handled, sir.',
      ),
    ).toBe("Handled, sir.");
  });

  it("strips [SYSTEM-PARSED DATES ...] tag", () => {
    expect(
      stripSystemTags(
        'Captured. [SYSTEM-PARSED DATES — MANDATORY: copy these ISO strings...]',
      ),
    ).toBe("Captured.");
  });

  it("strips both prefix and inline tag in one pass", () => {
    expect(
      stripSystemTags(
        '[CLARIFICATION REPLY] Task X (P∞)\n\n[SYSTEM-PARSED PRIORITY — Set ...]',
      ),
    ).toBe("Task X (P∞)");
  });

  it("preserves text with no tags", () => {
    expect(stripSystemTags("Task filed, sir.")).toBe("Task filed, sir.");
  });

  it("trims whitespace", () => {
    expect(stripSystemTags("  Hello  ")).toBe("Hello");
  });
});
