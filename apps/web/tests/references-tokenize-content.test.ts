import { describe, expect, it } from "vitest";
import { tokenizeContent } from "@/lib/captures/tokenize-content";
import { serializeReference } from "@/lib/references/token";

const UUID_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const UUID_B = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";

const tok = (label: string, type = "task", id = UUID_A) =>
  `@[${label}](ref://${type}/${id})`;

describe("tokenizeContent — reference tokens", () => {
  it("emits a whole token as one entityRef segment", () => {
    expect(tokenizeContent(tok("Marathon"))).toEqual([
      {
        kind: "entityRef",
        ref: { type: "task", id: UUID_A, label: "Marathon" },
      },
    ]);
  });

  it("keeps the prose around a token", () => {
    const segments = tokenizeContent(`ping ${tok("Marathon")} today`);
    expect(segments).toEqual([
      { kind: "text", value: "ping " },
      {
        kind: "entityRef",
        ref: { type: "task", id: UUID_A, label: "Marathon" },
      },
      { kind: "text", value: " today" },
    ]);
  });

  it("handles every reference type", () => {
    for (const type of ["capture", "task", "page", "project", "area", "person"]) {
      const segments = tokenizeContent(tok("x", type));
      expect(segments[0]).toMatchObject({ kind: "entityRef" });
    }
  });

  it("emits several tokens back to back with no text between", () => {
    const segments = tokenizeContent(`${tok("A")}${tok("B", "page", UUID_B)}`);
    expect(segments.map((s) => s.kind)).toEqual(["entityRef", "entityRef"]);
  });

  it("emits one segment per mention of the same entity", () => {
    const segments = tokenizeContent(`${tok("A")} and ${tok("A")}`);
    expect(segments.filter((s) => s.kind === "entityRef")).toHaveLength(2);
  });
});

describe("tokenizeContent — references vs the other rules", () => {
  it("does not chip a hashtag INSIDE a label", () => {
    // The label is display text, not content to re-parse.
    const segments = tokenizeContent(tok("Buy #milk today"));
    expect(segments).toEqual([
      {
        kind: "entityRef",
        ref: { type: "task", id: UUID_A, label: "Buy #milk today" },
      },
    ]);
  });

  it("does not treat a token's leading @ as a person mention", () => {
    const segments = tokenizeContent(tok("Ada"), { personNames: ["Ada"] });
    expect(segments).toEqual([
      { kind: "entityRef", ref: { type: "task", id: UUID_A, label: "Ada" } },
    ]);
  });

  it("does not person-chip a name inside a label", () => {
    const segments = tokenizeContent(tok("lunch with @Ada"), {
      personNames: ["Ada"],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: "entityRef" });
  });

  it("still chips hashtags and people around a token", () => {
    const segments = tokenizeContent(`#gym ${tok("Run")} @Ada`, {
      personNames: ["Ada"],
    });
    expect(segments.map((s) => s.kind)).toEqual([
      "hashtag",
      "text",
      "entityRef",
      "text",
      "person",
    ]);
  });

  it("chips a hashtag flush against a token's closing paren", () => {
    const segments = tokenizeContent(`${tok("Run")}#gym`);
    expect(segments.map((s) => s.kind)).toEqual(["entityRef", "hashtag"]);
  });
});

describe("tokenizeContent — streaming and partial tokens", () => {
  // The invariant: never chip anything that isn't a complete token. Each of
  // these is a real prefix a streaming renderer sees mid-frame.
  const prefixes = [
    "@",
    "@[",
    "@[Mara",
    "@[Marathon]",
    "@[Marathon](",
    "@[Marathon](ref:",
    "@[Marathon](ref://",
    "@[Marathon](ref://ta",
    "@[Marathon](ref://task",
    "@[Marathon](ref://task/",
    "@[Marathon](ref://task/3f2504e0",
    `@[Marathon](ref://task/${UUID_A}`,
  ];

  for (const prefix of prefixes) {
    it(`leaves the prefix ${JSON.stringify(prefix)} as plain text`, () => {
      const segments = tokenizeContent(prefix);
      expect(segments.some((s) => s.kind === "entityRef")).toBe(false);
    });
  }

  it("chips only once the final character lands", () => {
    const full = tok("Marathon");
    const oneShort = full.slice(0, -1);
    expect(tokenizeContent(oneShort).some((s) => s.kind === "entityRef")).toBe(
      false,
    );
    expect(tokenizeContent(full).some((s) => s.kind === "entityRef")).toBe(true);
  });

  it("preserves a partial token's text exactly, losing nothing", () => {
    const partial = "@[Marathon](ref://ta";
    expect(
      tokenizeContent(partial)
        .map((s) => (s.kind === "text" ? s.value : ""))
        .join(""),
    ).toBe(partial);
  });
});

describe("tokenizeContent — adversarial", () => {
  it("does not chip a bare uuid in prose", () => {
    const segments = tokenizeContent(`see ${UUID_A} for details`);
    expect(segments).toEqual([
      { kind: "text", value: `see ${UUID_A} for details` },
    ]);
  });

  it("does not chip a ref:// url that isn't in token form", () => {
    const segments = tokenizeContent(`ref://task/${UUID_A}`);
    expect(segments.some((s) => s.kind === "entityRef")).toBe(false);
  });

  it("rejects an unknown entity type", () => {
    const segments = tokenizeContent(`@[Standup](ref://event/${UUID_A})`);
    expect(segments.some((s) => s.kind === "entityRef")).toBe(false);
  });

  it("rejects a malformed uuid", () => {
    const segments = tokenizeContent("@[x](ref://task/not-a-uuid)");
    expect(segments.some((s) => s.kind === "entityRef")).toBe(false);
  });

  it("rejects an uppercase uuid, which the grammar does not admit", () => {
    const segments = tokenizeContent(`@[x](ref://task/${UUID_A.toUpperCase()})`);
    expect(segments.some((s) => s.kind === "entityRef")).toBe(false);
  });

  it("stops a label at the first ] — the label alphabet excludes it", () => {
    // serializeReference strips `]`, so this can only arrive hand-written.
    const segments = tokenizeContent(`@[a]b](ref://task/${UUID_A})`);
    expect(segments.some((s) => s.kind === "entityRef")).toBe(false);
  });

  it("round-trips a label whose ] was stripped on serialize", () => {
    const text = serializeReference({
      type: "task",
      id: UUID_A,
      label: "a]b",
    });
    expect(tokenizeContent(text)).toEqual([
      { kind: "entityRef", ref: { type: "task", id: UUID_A, label: "ab" } },
    ]);
  });

  it("accepts an empty label", () => {
    const segments = tokenizeContent(`@[](ref://task/${UUID_A})`);
    expect(segments).toEqual([
      { kind: "entityRef", ref: { type: "task", id: UUID_A, label: "" } },
    ]);
  });

  it("accepts a label carrying parens and markdown-ish characters", () => {
    const label = "Fix (the *thing*) [now]";
    const text = serializeReference({ type: "task", id: UUID_A, label });
    expect(tokenizeContent(text)).toEqual([
      {
        kind: "entityRef",
        // `]` is stripped on serialize; everything else survives.
        ref: { type: "task", id: UUID_A, label: "Fix (the *thing*) [now" },
      },
    ]);
  });

  it("does not let an email's @ start a token", () => {
    const segments = tokenizeContent(`me@x.com ${tok("Run")}`);
    expect(segments[0]).toEqual({ kind: "text", value: "me@x.com " });
    expect(segments[1]).toMatchObject({ kind: "entityRef" });
  });
});

describe("tokenizeContent — preserved behavior", () => {
  // The docstring's own regression list: punctuation-adjacent tags used to
  // fall back to plain text. None of that may change.
  it("chips punctuation-adjacent hashtags", () => {
    expect(tokenizeContent("#tag,").map((s) => s.kind)).toEqual([
      "hashtag",
      "text",
    ]);
    expect(tokenizeContent("(#tag)").map((s) => s.kind)).toEqual([
      "text",
      "hashtag",
      "text",
    ]);
    // `#a#b` chips only the first: the second `#` is preceded by a word char,
    // which the boundary guard rejects — deliberately identical to the save
    // path's /(?<![\p{L}\p{N}_])#…/ so what pills matches what persisted.
    expect(tokenizeContent("#a#b")).toEqual([
      { kind: "hashtag", display: "a" },
      { kind: "text", value: "#b" },
    ]);
  });

  it("keeps the trailing-word-char person guard", () => {
    // "@Jon" must not match a person called "Jo".
    const segments = tokenizeContent("@Jon", { personNames: ["Jo"] });
    expect(segments).toEqual([{ kind: "text", value: "@Jon" }]);
  });

  it("still matches the longest person name first", () => {
    const segments = tokenizeContent("@John Smith", {
      personNames: ["John", "John Smith"],
    });
    expect(segments).toEqual([{ kind: "person", display: "John Smith" }]);
  });

  it("leaves unknown @handles plain", () => {
    expect(tokenizeContent("@nobody", { personNames: ["Ada"] })).toEqual([
      { kind: "text", value: "@nobody" },
    ]);
  });

  it("maps hashtag display casing", () => {
    const segments = tokenizeContent("#gym", {
      hashtagDisplay: new Map([["gym", "GYM"]]),
    });
    expect(segments).toEqual([{ kind: "hashtag", display: "GYM" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(tokenizeContent("")).toEqual([]);
  });
});
