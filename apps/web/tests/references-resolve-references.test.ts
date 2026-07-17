import { describe, expect, it } from "vitest";
import { serializeReference } from "@/lib/references/token";
import {
  type ResolvedReference,
  collectReferencesForResolution,
  formatReferencedEntitiesBlock,
  historyUserTextsNewestFirst,
} from "@/lib/jarvis/resolve-references";

const TASK = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CAPTURE = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";
const PROJECT = "11111111-2222-4333-8444-555555555555";
const PERSON = "99999999-8888-4777-8666-555544443333";

const tok = (type: Parameters<typeof serializeReference>[0]["type"], id: string, label: string) =>
  serializeReference({ type, id, label });

describe("collectReferencesForResolution", () => {
  it("takes the current input's references first, then history newest→oldest", () => {
    const input = `move this to ${tok("project", PROJECT, "Marathon")}`;
    const history = [
      `about ${tok("capture", CAPTURE, "grocery note")}`, // newest history
      `re ${tok("task", TASK, "Ship it")}`, // older history
    ];
    const refs = collectReferencesForResolution(input, history);
    expect(refs.map((r) => r.id)).toEqual([PROJECT, CAPTURE, TASK]);
  });

  it("dedupes by (type, id), keeping the first occurrence", () => {
    const input = `${tok("task", TASK, "First label")} and ${tok("task", TASK, "Second label")}`;
    const refs = collectReferencesForResolution(input, []);
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toBe("First label");
  });

  it("treats the same id under different types as distinct", () => {
    const input = `${tok("task", TASK, "as task")} ${tok("capture", TASK, "as capture")}`;
    const refs = collectReferencesForResolution(input, []);
    expect(refs).toHaveLength(2);
  });

  it("caps at the distinct-reference limit", () => {
    const ids = Array.from(
      { length: 12 },
      (_, i) => `00000000-0000-4000-8000-0000000000${(i + 10).toString().padStart(2, "0")}`,
    );
    const input = ids.map((id) => tok("task", id, "t")).join(" ");
    const refs = collectReferencesForResolution(input, [], 8);
    expect(refs).toHaveLength(8);
    expect(refs.map((r) => r.id)).toEqual(ids.slice(0, 8));
  });

  it("returns [] when nothing is referenced", () => {
    expect(collectReferencesForResolution("just plain prose", ["more prose"])).toEqual([]);
  });
});

describe("historyUserTextsNewestFirst", () => {
  const current = { role: "user" as const, content: "current turn" };

  it("excludes the last message (the current turn) and yields user turns newest first", () => {
    const texts = historyUserTextsNewestFirst([
      { role: "user", content: "first user" },
      { role: "assistant", content: "assistant reply" },
      { role: "user", content: "second user" },
      current,
    ]);
    expect(texts).toEqual(["second user", "first user"]);
  });

  it("extracts only text blocks from array content, ignoring tool_result feedback", () => {
    const texts = historyUserTextsNewestFirst([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "x", content: "{\"ref\":\"@[a](ref://task/…)\"}" },
          { type: "text", text: "please do the thing" },
        ],
      },
      current,
    ]);
    expect(texts).toEqual(["please do the thing"]);
  });

  it("returns [] when there is only a current message", () => {
    expect(historyUserTextsNewestFirst([current])).toEqual([]);
  });
});

describe("formatReferencedEntitiesBlock", () => {
  it("returns an empty string for no entries so the caller can skip injection", () => {
    expect(formatReferencedEntitiesBlock([])).toBe("");
  });

  it("renders a resolved entry with its summary and preserves input order", () => {
    const entries: ResolvedReference[] = [
      { type: "project", id: PROJECT, status: "resolved", title: "Marathon", summary: "training plan" },
      { type: "person", id: PERSON, status: "resolved", title: "Alex" },
    ];
    const block = formatReferencedEntitiesBlock(entries);
    const lines = block.split("\n");
    expect(lines[0]).toBe("<referenced_entities>");
    expect(lines[lines.length - 1]).toBe("</referenced_entities>");
    expect(block).toContain(`[project] id=${PROJECT} "Marathon" — training plan`);
    expect(block).toContain(`[person] id=${PERSON} "Alex"`);
    // person line carries no " — " summary
    expect(block).not.toContain(`"Alex" —`);
    // input order preserved (project before person)
    expect(block.indexOf(PROJECT)).toBeLessThan(block.indexOf(PERSON));
  });

  it("renders a deleted target as a tombstone the model is told not to act on", () => {
    const block = formatReferencedEntitiesBlock([
      { type: "task", id: TASK, status: "deleted", title: "Old task" },
    ]);
    expect(block).toContain(`[task] id=${TASK} "Old task" (deleted`);
    expect(block).toContain("do not act on it");
  });
});
