import { describe, expect, it } from "vitest";

import { buildTurnHints } from "../turn-hints";

describe("buildTurnHints — tool_choice", () => {
  it("auto-infers with no slash command", () => {
    expect(buildTurnHints({ input: "call the dentist tomorrow" }).toolChoice).toEqual({
      type: "auto",
    });
  });

  it("forces the matching create_* tool", () => {
    expect(buildTurnHints({ input: "x", slashCommand: "task" }).toolChoice).toEqual({
      type: "tool",
      name: "create_task",
    });
    expect(buildTurnHints({ input: "x", slashCommand: "capture" }).toolChoice).toEqual({
      type: "tool",
      name: "create_capture",
    });
    expect(buildTurnHints({ input: "x", slashCommand: "event" }).toolChoice).toEqual({
      type: "tool",
      name: "create_event",
    });
  });

  it("forbids tools for /ask", () => {
    const hints = buildTurnHints({ input: "anything", slashCommand: "ask" });
    expect(hints.toolChoice).toEqual({ type: "none" });
    expect(hints.askMode).toBe(true);
  });

  it("leaves /help alone, since the client renders it", () => {
    expect(buildTurnHints({ input: "x", slashCommand: "help" }).toolChoice).toEqual({
      type: "auto",
    });
  });

  it("treats a bare meta-question as /ask", () => {
    for (const q of [
      "what did I do today?",
      "how many tasks are left?",
      "show me my captures",
      "  Summarize this week",
    ]) {
      expect(buildTurnHints({ input: q }).askMode).toBe(true);
    }
  });

  it("does not fire on a question word buried mid-sentence", () => {
    expect(buildTurnHints({ input: "remind me to ask how many people are coming" }).askMode).toBe(
      false,
    );
  });

  it("an explicit slash command beats meta-question detection", () => {
    expect(buildTurnHints({ input: "how many push-ups today", slashCommand: "task" })).toMatchObject(
      { askMode: false, toolChoice: { type: "tool", name: "create_task" } },
    );
  });
});

describe("buildTurnHints — system hints", () => {
  it("leaves plain input untouched", () => {
    expect(buildTurnHints({ input: "call the dentist" }).userContent).toBe("call the dentist");
  });

  it("appends parsed dates verbatim", () => {
    const hints = buildTurnHints({
      input: "dinner thursday",
      parsedDates: [{ text: "thursday", start: "2026-07-30T19:00:00-04:00" }],
    });
    expect(hints.userContent).toContain("SYSTEM-PARSED DATES");
    expect(hints.userContent).toContain("2026-07-30T19:00:00-04:00");
    expect(hints.userContent.startsWith("dinner thursday")).toBe(true);
  });

  it("appends the priority override", () => {
    expect(buildTurnHints({ input: "x", parsedPriority: "P1" }).userContent).toContain(
      'Set create_task.priority to exactly "P1"',
    );
  });

  it("appends linked references in a stable order", () => {
    const hints = buildTurnHints({
      input: "x",
      linkedProjectIds: ["p1"],
      linkedHashtags: ["#reading"],
      linkedPeople: [{ id: "u1", name: "Rohan" }],
    });
    const linked = hints.userContent.slice(hints.userContent.indexOf("[Linked references"));
    expect(linked.indexOf("projects=")).toBeLessThan(linked.indexOf("hashtags="));
    expect(linked.indexOf("hashtags=")).toBeLessThan(linked.indexOf("people="));
  });

  it("omits the linked-references block when nothing is linked", () => {
    const hints = buildTurnHints({ input: "x", linkedProjectIds: [], linkedHashtags: [] });
    expect(hints.userContent).not.toContain("Linked references");
  });

  it("caps clarification depth when the input is a clarification reply", () => {
    const hints = buildTurnHints({ input: "[CLARIFICATION REPLY] the 3pm one" });
    expect(hints.isClarificationReply).toBe(true);
    expect(hints.userContent).toContain("Do NOT emit another ask_clarification");
  });

  it("carries channel notes without touching the leading utterance", () => {
    const hints = buildTurnHints({
      input: "add milk",
      channelNotes: ["This message arrived by SMS.", "  "],
    });
    expect(hints.userContent.startsWith("add milk")).toBe(true);
    expect(hints.userContent).toContain("[CHANNEL NOTE: This message arrived by SMS.]");
    // Blank notes are dropped rather than emitting an empty bracket.
    expect(hints.userContent).not.toContain("[CHANNEL NOTE: ]");
  });
});
