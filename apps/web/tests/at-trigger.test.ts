import { describe, expect, it } from "vitest";
import {
  JARVIS_LABEL,
  JARVIS_TOKEN,
  hasPromptBody,
  matchesJarvisTrigger,
  normalizePrompt,
} from "@/lib/jarvis/at-trigger";

describe("at-trigger constants", () => {
  it("completes @J to @Jarvis", () => {
    // Typing `@J` selects the JARVIS item, which commits the JARVIS_TOKEN.
    expect(matchesJarvisTrigger("J")).toBe(true);
    expect(JARVIS_TOKEN).toBe("@Jarvis");
    expect(JARVIS_LABEL).toBe("Jarvis");
  });
});

describe("matchesJarvisTrigger", () => {
  it("matches an empty query (menu shows on bare @)", () => {
    expect(matchesJarvisTrigger("")).toBe(true);
  });

  it("matches case-insensitive prefixes of the label", () => {
    expect(matchesJarvisTrigger("jar")).toBe(true);
    expect(matchesJarvisTrigger("JARV")).toBe(true);
  });

  it("matches aliases", () => {
    expect(matchesJarvisTrigger("ai")).toBe(true);
    expect(matchesJarvisTrigger("kiwi")).toBe(true);
  });

  it("rejects a non-matching query", () => {
    expect(matchesJarvisTrigger("zzz")).toBe(false);
  });
});

describe("normalizePrompt", () => {
  it("strips a leading @Jarvis token", () => {
    expect(normalizePrompt("@Jarvis add a task to call mom")).toBe(
      "add a task to call mom",
    );
  });

  it("is case-insensitive on the token and trims whitespace", () => {
    expect(normalizePrompt("  @jarvis   qc p1  ")).toBe("qc p1");
  });

  it("leaves text without a leading token unchanged (just trimmed)", () => {
    expect(normalizePrompt("  add a task  ")).toBe("add a task");
  });

  it("returns empty for empty input", () => {
    expect(normalizePrompt("")).toBe("");
    expect(normalizePrompt("@Jarvis")).toBe("");
  });
});

describe("hasPromptBody", () => {
  it("is false for a bare invocation token", () => {
    expect(hasPromptBody("@Jarvis")).toBe(false);
    expect(hasPromptBody("  @jarvis  ")).toBe(false);
  });

  it("is true when an instruction follows", () => {
    expect(hasPromptBody("@Jarvis do the thing")).toBe(true);
  });
});
