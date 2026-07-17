import { describe, expect, it } from "vitest";
import {
  type EntityRef,
  captureLabel,
  dedupeReferences,
  isEntityRefType,
  parseReferences,
  REFERENCE_TOKEN_RE,
  referenceTokenRe,
  serializeReference,
  splitTextWithReferences,
  stripReferences,
} from "@/lib/references/token";

const UUID_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const UUID_B = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";

describe("serializeReference", () => {
  it("renders the canonical token", () => {
    expect(
      serializeReference({ type: "task", id: UUID_A, label: "Ship it" }),
    ).toBe(`@[Ship it](ref://task/${UUID_A})`);
  });

  it("strips ] from the label so it cannot terminate the label group early", () => {
    const token = serializeReference({
      type: "page",
      id: UUID_A,
      label: "Notes] on ]brackets",
    });
    expect(token).toBe(`@[Notes on brackets](ref://page/${UUID_A})`);
    expect(parseReferences(token)[0].label).toBe("Notes on brackets");
  });

  it("lowercases the uuid so the token stays parseable", () => {
    const token = serializeReference({
      type: "area",
      id: UUID_A.toUpperCase(),
      label: "Health",
    });
    expect(token).toBe(`@[Health](ref://area/${UUID_A})`);
    expect(parseReferences(token)).toHaveLength(1);
  });

  it("tolerates an empty label", () => {
    const token = serializeReference({ type: "person", id: UUID_A, label: "" });
    expect(token).toBe(`@[](ref://person/${UUID_A})`);
    expect(parseReferences(token)[0].label).toBe("");
  });
});

describe("parseReferences", () => {
  it("round-trips every entity type", () => {
    for (const type of [
      "capture",
      "task",
      "page",
      "project",
      "area",
      "person",
    ] as const) {
      const ref: EntityRef = { type, id: UUID_A, label: `A ${type}` };
      const parsed = parseReferences(serializeReference(ref));
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject(ref);
    }
  });

  it("finds several references in prose and reports their spans", () => {
    const a = serializeReference({ type: "task", id: UUID_A, label: "Alpha" });
    const b = serializeReference({ type: "area", id: UUID_B, label: "Beta" });
    const text = `before ${a} middle ${b} after`;
    const refs = parseReferences(text);

    expect(refs.map((r) => r.label)).toEqual(["Alpha", "Beta"]);
    expect(text.slice(refs[0].start, refs[0].end)).toBe(a);
    expect(text.slice(refs[1].start, refs[1].end)).toBe(b);
  });

  it("returns nothing for plain prose", () => {
    expect(parseReferences("just some words, no tokens here")).toEqual([]);
    expect(parseReferences("")).toEqual([]);
  });

  it("accepts labels holding parens, @, #, and newlines", () => {
    const label = "Weird (title) @home #tag\nline two";
    const parsed = parseReferences(
      serializeReference({ type: "page", id: UUID_A, label }),
    );
    expect(parsed[0].label).toBe(label);
  });

  it("matches back-to-back tokens with no separator", () => {
    const a = serializeReference({ type: "task", id: UUID_A, label: "A" });
    const b = serializeReference({ type: "task", id: UUID_B, label: "B" });
    expect(parseReferences(a + b).map((r) => r.label)).toEqual(["A", "B"]);
  });
});

describe("parseReferences — streaming and partial-token safety", () => {
  const full = serializeReference({
    type: "task",
    id: UUID_A,
    label: "Marathon",
  });

  it("matches no prefix of a token until the token is complete", () => {
    // Every strict prefix must stay plain text: this is what stops a chip from
    // flickering into the transcript while JARVIS is mid-stream.
    for (let i = 1; i < full.length; i++) {
      expect(parseReferences(full.slice(0, i))).toEqual([]);
    }
    expect(parseReferences(full)).toHaveLength(1);
  });

  it("does not chip a token whose trailing paren has not arrived", () => {
    expect(parseReferences(`@[Marathon](ref://task/${UUID_A}`)).toEqual([]);
  });

  it("keeps an incomplete trailing token as text while emitting the complete one", () => {
    const segments = splitTextWithReferences(`${full} and @[Next](ref://ta`);
    expect(segments).toEqual([
      { kind: "ref", ref: { type: "task", id: UUID_A, label: "Marathon" } },
      { kind: "text", text: " and @[Next](ref://ta" },
    ]);
  });
});

describe("parseReferences — adversarial input", () => {
  it("ignores an unknown entity type", () => {
    expect(parseReferences(`@[X](ref://event/${UUID_A})`)).toEqual([]);
    expect(parseReferences(`@[X](ref://habit/${UUID_A})`)).toEqual([]);
  });

  it("ignores a malformed uuid", () => {
    expect(parseReferences("@[X](ref://task/not-a-uuid)")).toEqual([]);
    expect(parseReferences("@[X](ref://task/)")).toEqual([]);
    // Uppercase hex is not the canonical form and must not match.
    expect(parseReferences(`@[X](ref://task/${UUID_A.toUpperCase()})`)).toEqual(
      [],
    );
    // One hex digit short.
    expect(parseReferences("@[X](ref://task/3f2504e0-4f89-11d3-9a0c-0305e82c330)")).toEqual([]);
  });

  it("ignores path traversal in the ref target", () => {
    expect(parseReferences("@[x](ref://bogus/../)")).toEqual([]);
    expect(parseReferences(`@[x](ref://task/../${UUID_A})`)).toEqual([]);
    expect(parseReferences("@[x](ref://../task/x)")).toEqual([]);
  });

  it("ignores a bare uuid sitting in prose", () => {
    expect(parseReferences(`the id is ${UUID_A} ok`)).toEqual([]);
  });

  it("ignores an email address", () => {
    expect(parseReferences("mail me at bob@[example].com")).toEqual([]);
    expect(parseReferences("filippo@example.com wrote back")).toEqual([]);
  });

  it("ignores a plain markdown link", () => {
    expect(parseReferences("[Ship it](https://example.com)")).toEqual([]);
    expect(parseReferences(`[Ship it](ref://task/${UUID_A})`)).toEqual([]);
  });

  it("handles nested brackets without running past the label", () => {
    // The label group stops at the first `]`, so the inner `]` bounds it and
    // the leftover `](ref://...)` is not a token.
    expect(parseReferences(`@[a[b]c](ref://task/${UUID_A})`)).toEqual([]);
    // ...but a nested OPEN bracket is a legal label character.
    const parsed = parseReferences(`@[a[b c](ref://task/${UUID_A})`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("a[b c");
  });

  it("ignores the wrong scheme", () => {
    expect(parseReferences(`@[X](https://task/${UUID_A})`)).toEqual([]);
    expect(parseReferences(`@[X](ref:/task/${UUID_A})`)).toEqual([]);
  });

  it("is not confused by an @ immediately before a token", () => {
    const parsed = parseReferences(`@@[X](ref://task/${UUID_A})`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("X");
  });
});

describe("referenceTokenRe", () => {
  it("hands out a fresh, unshared instance each call", () => {
    const a = referenceTokenRe();
    const b = referenceTokenRe();
    expect(a).not.toBe(b);
    a.exec(serializeReference({ type: "task", id: UUID_A, label: "x" }));
    expect(a.lastIndex).toBeGreaterThan(0);
    expect(b.lastIndex).toBe(0);
  });

  it("matches the exported canonical pattern", () => {
    expect(referenceTokenRe().source).toBe(REFERENCE_TOKEN_RE.source);
  });

  it("stays global so repeated scans find every token", () => {
    expect(referenceTokenRe().global).toBe(true);
  });
});

describe("splitTextWithReferences", () => {
  it("loses nothing — segments reassemble into the input", () => {
    const a = serializeReference({ type: "task", id: UUID_A, label: "Alpha" });
    const b = serializeReference({ type: "person", id: UUID_B, label: "Bo" });
    const text = `ping ${a} and ${b}!`;

    const rebuilt = splitTextWithReferences(text)
      .map((s) => (s.kind === "text" ? s.text : serializeReference(s.ref)))
      .join("");
    expect(rebuilt).toBe(text);
  });

  it("returns one ref segment for a string that is only a token", () => {
    const token = serializeReference({
      type: "area",
      id: UUID_A,
      label: "Health",
    });
    expect(splitTextWithReferences(token)).toEqual([
      { kind: "ref", ref: { type: "area", id: UUID_A, label: "Health" } },
    ]);
  });

  it("returns a lone text segment for plain prose", () => {
    expect(splitTextWithReferences("nothing here")).toEqual([
      { kind: "text", text: "nothing here" },
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitTextWithReferences("")).toEqual([]);
  });
});

describe("stripReferences", () => {
  it("leaves readable prose behind", () => {
    const token = serializeReference({
      type: "project",
      id: UUID_A,
      label: "Marathon Training",
    });
    expect(stripReferences(`add this to ${token} today`)).toBe(
      "add this to Marathon Training today",
    );
  });

  it("leaves an incomplete token untouched", () => {
    expect(stripReferences("@[Next](ref://ta")).toBe("@[Next](ref://ta");
  });
});

describe("dedupeReferences", () => {
  it("collapses repeats of the same target, keeping the first label", () => {
    const refs: EntityRef[] = [
      { type: "task", id: UUID_A, label: "first" },
      { type: "task", id: UUID_A, label: "second" },
      { type: "task", id: UUID_B, label: "other" },
    ];
    expect(dedupeReferences(refs)).toEqual([
      { type: "task", id: UUID_A, label: "first" },
      { type: "task", id: UUID_B, label: "other" },
    ]);
  });

  it("treats the same id under different types as distinct targets", () => {
    const refs: EntityRef[] = [
      { type: "task", id: UUID_A, label: "as task" },
      { type: "page", id: UUID_A, label: "as page" },
    ];
    expect(dedupeReferences(refs)).toHaveLength(2);
  });
});

describe("isEntityRefType", () => {
  it("accepts the six supported kinds and nothing else", () => {
    for (const t of ["capture", "task", "page", "project", "area", "person"]) {
      expect(isEntityRefType(t)).toBe(true);
    }
    for (const t of ["event", "habit", "", null, undefined, 7, {}]) {
      expect(isEntityRefType(t)).toBe(false);
    }
  });
});

describe("captureLabel", () => {
  it("takes the first non-empty line", () => {
    expect(captureLabel("\n\n  buy milk  \nand eggs")).toBe("buy milk");
  });

  it("truncates with an ellipsis at the cap", () => {
    const label = captureLabel("x".repeat(200));
    expect(label).toHaveLength(80);
    expect(label.endsWith("…")).toBe(true);
  });

  it("leaves a line exactly at the cap intact", () => {
    const exact = "y".repeat(80);
    expect(captureLabel(exact)).toBe(exact);
  });

  it("returns an empty string for empty or whitespace-only content", () => {
    expect(captureLabel("")).toBe("");
    expect(captureLabel("   \n\t\n  ")).toBe("");
  });

  it("honours a custom cap", () => {
    expect(captureLabel("abcdefghij", 5)).toBe("abcd…");
  });
});
