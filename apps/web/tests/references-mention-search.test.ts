import { describe, expect, it } from "vitest";
import {
  type EntityMentionCandidate,
  MAX_PER_KIND,
  MAX_RECENT_PER_KIND,
  MENTION_KIND_ORDER,
  assembleMentionGroups,
  escapeLikePattern,
  toPrefixTsQuery,
} from "@/lib/references/mention-search";
import { captureLabel } from "@/lib/references/token";

const candidate = (
  kind: EntityMentionCandidate["kind"],
  label: string,
): EntityMentionCandidate => ({ kind, id: `${kind}-${label}`, label });

describe("assembleMentionGroups", () => {
  it("orders groups capture, task, page, project, area, person", () => {
    const groups = assembleMentionGroups([
      candidate("person", "Bo"),
      candidate("area", "Health"),
      candidate("capture", "note"),
      candidate("project", "Marathon"),
      candidate("page", "Notes"),
      candidate("task", "Ship it"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual([
      "capture",
      "task",
      "page",
      "project",
      "area",
      "person",
    ]);
  });

  it("drops empty groups rather than rendering a bare header", () => {
    const groups = assembleMentionGroups([
      candidate("task", "Ship it"),
      candidate("person", "Bo"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["task", "person"]);
  });

  it("returns no groups for no candidates", () => {
    expect(assembleMentionGroups([])).toEqual([]);
  });

  it("keeps every item of a kind together, in the order given", () => {
    const groups = assembleMentionGroups([
      candidate("task", "first"),
      candidate("person", "Bo"),
      candidate("task", "second"),
    ]);
    expect(groups[0]).toEqual({
      kind: "task",
      items: [candidate("task", "first"), candidate("task", "second")],
    });
  });

  it("covers every kind the token grammar allows", () => {
    // A kind missing here would be silently unreachable in the picker.
    const groups = assembleMentionGroups(
      MENTION_KIND_ORDER.map((k) => candidate(k, "x")),
    );
    expect(groups).toHaveLength(MENTION_KIND_ORDER.length);
  });
});

describe("toPrefixTsQuery", () => {
  it("prefix-matches a single word so a mid-word query still hits", () => {
    expect(toPrefixTsQuery("marat")).toBe("marat:*");
  });

  it("ANDs multiple words, each prefixed", () => {
    expect(toPrefixTsQuery("marathon train")).toBe("marathon:* & train:*");
  });

  it("strips every tsquery operator so the parser cannot see one", () => {
    // The danger isn't injection (drizzle binds it) — it's a syntax error
    // from a stray paren taking down the whole picker.
    expect(toPrefixTsQuery("foo & bar")).toBe("foo:* & bar:*");
    expect(toPrefixTsQuery("a|b")).toBe("ab:*");
    expect(toPrefixTsQuery("!(x):*")).toBe("x:*");
    expect(toPrefixTsQuery("a <-> b")).toBe("a:* & b:*");
  });

  it("returns null when nothing survives sanitizing", () => {
    // Rather than letting to_tsquery('english', '') run.
    expect(toPrefixTsQuery("")).toBeNull();
    expect(toPrefixTsQuery("   ")).toBeNull();
    expect(toPrefixTsQuery("!!!")).toBeNull();
    expect(toPrefixTsQuery("&|()")).toBeNull();
  });

  it("keeps unicode letters, numbers, and underscores", () => {
    expect(toPrefixTsQuery("café")).toBe("café:*");
    expect(toPrefixTsQuery("agua_2026")).toBe("agua_2026:*");
    expect(toPrefixTsQuery("日本語")).toBe("日本語:*");
  });

  it("collapses surrounding whitespace", () => {
    expect(toPrefixTsQuery("  spaced   out  ")).toBe("spaced:* & out:*");
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    // A user typing "50%" should find "50%", not everything starting with 50.
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLikePattern("marathon")).toBe("marathon");
    expect(escapeLikePattern("")).toBe("");
  });
});

describe("mention caps", () => {
  it("caps a real query at 6 per kind and recents at 4", () => {
    expect(MAX_PER_KIND).toBe(6);
    expect(MAX_RECENT_PER_KIND).toBe(4);
  });
});

describe("capture label synthesis for the picker", () => {
  it("labels a capture by its first line, capped at 80", () => {
    // The one entity with no title: the picker has to invent a label, and
    // every surface has to invent the same one.
    expect(captureLabel("buy milk\nand eggs")).toBe("buy milk");
    expect(captureLabel("z".repeat(120))).toHaveLength(80);
  });
});
