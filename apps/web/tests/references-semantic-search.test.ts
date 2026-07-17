import { describe, expect, it } from "vitest";
import type { EntityMentionCandidate } from "@/lib/references/mention-search";
import {
  type EntityMentionOption,
  SEMANTIC_SECTION_KEY,
  mentionRows,
  mergeSemanticOptions,
} from "@/lib/references/mention-list";
import {
  SEMANTIC_MIN_QUERY_LENGTH,
  SEMANTIC_SIMILARITY_FLOOR,
  SEMANTIC_TOP_K,
  toVectorLiteral,
} from "@/lib/references/semantic-search";

const exact = (
  kind: EntityMentionCandidate["kind"],
  id: string,
  label = id,
): EntityMentionOption => ({ kind, id, label });

const semantic = (
  kind: EntityMentionCandidate["kind"],
  id: string,
  similarity: number,
  label = id,
): EntityMentionCandidate => ({ kind, id, label, similarity });

describe("mergeSemanticOptions", () => {
  it("keeps the exact list first and verbatim, semantic appended after", () => {
    const merged = mergeSemanticOptions(
      [exact("task", "t1"), exact("page", "p1")],
      [semantic("capture", "c1", 0.9)],
    );
    expect(merged.map((o) => `${o.kind}:${o.id}`)).toEqual([
      "task:t1",
      "page:p1",
      "capture:c1",
    ]);
    expect(merged[2]!.semantic).toBe(true);
    // Exact options are untouched — no semantic flag leaks onto them.
    expect(merged[0]!.semantic).toBeUndefined();
  });

  it("drops a semantic hit that duplicates an exact option by (kind,id)", () => {
    const merged = mergeSemanticOptions(
      [exact("task", "t1")],
      [semantic("task", "t1", 0.95), semantic("capture", "c1", 0.8)],
    );
    expect(merged.map((o) => `${o.kind}:${o.id}`)).toEqual(["task:t1", "capture:c1"]);
    // The surviving t1 is the EXACT one (never flagged semantic).
    expect(merged[0]!.semantic).toBeUndefined();
  });

  it("dedupes within the semantic list too — a row never appears twice", () => {
    const merged = mergeSemanticOptions(
      [],
      [semantic("capture", "c1", 0.9), semantic("capture", "c1", 0.7)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe("c1");
  });

  it("does not confuse the same id across different kinds", () => {
    const merged = mergeSemanticOptions(
      [exact("task", "shared")],
      [semantic("capture", "shared", 0.9)],
    );
    expect(merged.map((o) => `${o.kind}:${o.id}`)).toEqual([
      "task:shared",
      "capture:shared",
    ]);
  });

  it("preserves the incoming similarity order of the survivors", () => {
    const merged = mergeSemanticOptions(
      [],
      [
        semantic("capture", "c1", 0.91),
        semantic("task", "t2", 0.83),
        semantic("page", "p3", 0.76),
      ],
    );
    expect(merged.map((o) => o.id)).toEqual(["c1", "t2", "p3"]);
  });

  it("returns the exact list unchanged when there are no semantic hits", () => {
    const base = [exact("task", "t1")];
    expect(mergeSemanticOptions(base, [])).toEqual(base);
  });
});

describe("mentionRows section keying", () => {
  it("files every semantic hit under ONE Related section, even mixed kinds", () => {
    const merged = mergeSemanticOptions(
      [exact("task", "t1")],
      [semantic("capture", "c1", 0.9), semantic("page", "p1", 0.8)],
    );
    const rows = mentionRows(merged);
    const headers = rows.filter((r) => r.type === "header");
    // One header for the exact task group, one for the whole semantic run.
    expect(headers).toHaveLength(2);
    expect(headers[0]).toMatchObject({ kind: "task", semantic: false });
    expect(headers[1]).toMatchObject({ semantic: true });
  });

  it("still breaks exact groups on kind change", () => {
    const rows = mentionRows([exact("task", "t1"), exact("page", "p1")]);
    const headers = rows.filter((r) => r.type === "header");
    expect(headers.map((h) => (h.type === "header" ? h.kind : null))).toEqual([
      "task",
      "page",
    ]);
    expect(headers.every((h) => h.type === "header" && h.semantic === false)).toBe(true);
  });

  it("uses the shared semantic section key regardless of the hit's own kind", () => {
    // Both the capture and the page semantic hits map to the same section, so a
    // single Related header spans them — the section key is what mentionRows
    // watches, not the kind.
    const first = SEMANTIC_SECTION_KEY;
    const second = SEMANTIC_SECTION_KEY;
    expect(first).toBe(second);
    const rows = mentionRows(
      mergeSemanticOptions([], [semantic("capture", "c1", 0.9), semantic("page", "p1", 0.8)]),
    );
    expect(rows.filter((r) => r.type === "header")).toHaveLength(1);
  });
});

describe("semantic tuning constants", () => {
  it("floor is the documented untuned 0.75, top-K 8, min query length 3", () => {
    expect(SEMANTIC_SIMILARITY_FLOOR).toBe(0.75);
    expect(SEMANTIC_TOP_K).toBe(8);
    expect(SEMANTIC_MIN_QUERY_LENGTH).toBe(3);
  });
});

describe("toVectorLiteral", () => {
  it("formats an embedding as a pgvector text literal", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("handles the empty and single-element cases", () => {
    expect(toVectorLiteral([])).toBe("[]");
    expect(toVectorLiteral([0.5])).toBe("[0.5]");
  });

  it("emits negatives without spaces so the ::vector cast parses it", () => {
    expect(toVectorLiteral([-0.4, 0.4])).toBe("[-0.4,0.4]");
  });
});
