// TEST: slash-command detector (D-07).

import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../src/parsers/slash-command";

describe("parseSlashCommand", () => {
  it("/task buy flowers", () => {
    expect(parseSlashCommand("/task buy flowers")).toEqual({
      command: "task",
      body: "buy flowers",
    });
  });

  it("/capture random thought", () => {
    expect(parseSlashCommand("/capture random thought")).toEqual({
      command: "capture",
      body: "random thought",
    });
  });

  it("/event dinner 8pm", () => {
    expect(parseSlashCommand("/event dinner 8pm")).toEqual({
      command: "event",
      body: "dinner 8pm",
    });
  });

  it("/help (no body)", () => {
    expect(parseSlashCommand("/help")).toEqual({ command: "help", body: "" });
  });

  it("plain text returns null (auto-infer path)", () => {
    expect(parseSlashCommand("buy flowers")).toBeNull();
  });

  it("unknown commands return null", () => {
    expect(parseSlashCommand("/unknown foo")).toBeNull();
  });

  it("/task with no body returns empty body", () => {
    expect(parseSlashCommand("/task")).toEqual({ command: "task", body: "" });
  });

  it("tolerates leading whitespace", () => {
    expect(parseSlashCommand("  /task hello")).toEqual({
      command: "task",
      body: "hello",
    });
  });
});
