import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { EntityPill } from "@/components/references/EntityPill";
import {
  renderInlineMarkdown,
  renderUserText,
} from "@/lib/jarvis/inline-markdown";
import type { EntityRef } from "@/lib/references/token";

/**
 * These assert on the React elements the renderers RETURN, without mounting
 * them. That's enough to pin the tokenizer's decisions — which is what's under
 * test here — and it keeps the suite free of a DOM and a router.
 */

const UUID_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const tok = (label: string, type = "task", id = UUID_A) =>
  `@[${label}](ref://${type}/${id})`;

/** Every EntityPill element in a rendered node list, with its ref prop. */
function pillRefs(nodes: ReactNode[]): EntityRef[] {
  return nodes
    .filter(
      (n): n is ReactElement<{ entityRef: EntityRef }> =>
        isValidElement(n) && n.type === EntityPill,
    )
    .map((n) => n.props.entityRef);
}

/** The plain-string parts, concatenated — what the bubble reads as literal text. */
function plainText(nodes: ReactNode[]): string {
  return nodes.filter((n): n is string => typeof n === "string").join("");
}

/** Class names of the chip <span>s (hashtag/project/person registers). */
function chipClasses(nodes: ReactNode[]): string[] {
  return nodes
    .filter((n): n is ReactElement<{ className?: string }> => isValidElement(n))
    .map((n) => n.props.className ?? "")
    .filter((c) => c.includes("chip-inline"));
}

for (const [name, render] of [
  ["renderInlineMarkdown", renderInlineMarkdown],
  ["renderUserText", renderUserText],
] as const) {
  describe(`${name} — reference tokens`, () => {
    it("renders a complete token as an EntityPill", () => {
      expect(pillRefs(render(tok("Marathon")))).toEqual([
        { type: "task", id: UUID_A, label: "Marathon" },
      ]);
    });

    it("keeps the prose around a pill", () => {
      expect(plainText(render(`add to ${tok("Marathon")} now`))).toBe(
        "add to  now",
      );
    });

    it("renders several pills in one string", () => {
      expect(pillRefs(render(`${tok("A")} and ${tok("B", "page")}`))).toHaveLength(
        2,
      );
    });

    it("does not chip a hashtag inside a label", () => {
      const nodes = render(tok("Buy #milk"));
      expect(pillRefs(nodes)).toHaveLength(1);
      expect(chipClasses(nodes)).toHaveLength(0);
    });

    it("rejects an unknown type", () => {
      expect(pillRefs(render(`@[x](ref://event/${UUID_A})`))).toHaveLength(0);
    });
  });

  describe(`${name} — streaming safety`, () => {
    // The renderer runs on a partial string every frame while JARVIS types.
    const prefixes = [
      "@",
      "@[",
      "@[Mara",
      "@[Marathon]",
      "@[Marathon](ref://ta",
      `@[Marathon](ref://task/${UUID_A}`,
    ];

    for (const prefix of prefixes) {
      it(`never pills the prefix ${JSON.stringify(prefix)}`, () => {
        expect(pillRefs(render(prefix))).toHaveLength(0);
      });
    }

    it("keeps a partial token's text intact, character for character", () => {
      const partial = "@[Marathon](ref://ta";
      expect(plainText(render(partial))).toBe(partial);
    });

    it("pills in one step as the last character arrives", () => {
      const full = tok("Marathon");
      expect(pillRefs(render(full.slice(0, -1)))).toHaveLength(0);
      expect(pillRefs(render(full))).toHaveLength(1);
    });
  });

  describe(`${name} — @person`, () => {
    it("chips a known person (scout-A risk 3: this used to render literally)", () => {
      const nodes = render("ping @Ada tomorrow", { personNames: ["Ada"] });
      expect(chipClasses(nodes)).toEqual(["person-chip-inline"]);
      expect(plainText(nodes)).toBe("ping  tomorrow");
    });

    it("leaves @name plain when no names are supplied", () => {
      expect(plainText(render("ping @Ada"))).toBe("ping @Ada");
    });

    it("leaves an unknown handle plain", () => {
      expect(plainText(render("ping @nobody", { personNames: ["Ada"] }))).toBe(
        "ping @nobody",
      );
    });

    it("keeps the trailing-word-char guard: @Jon is not the person Jo", () => {
      expect(plainText(render("@Jon", { personNames: ["Jo"] }))).toBe("@Jon");
    });

    it("matches the longest name first", () => {
      const nodes = render("@John Smith", {
        personNames: ["John", "John Smith"],
      });
      expect(plainText(nodes)).toBe("");
      expect(chipClasses(nodes)).toEqual(["person-chip-inline"]);
    });

    it("does not treat an email as a mention", () => {
      expect(plainText(render("me@x.com", { personNames: ["x"] }))).toBe(
        "me@x.com",
      );
    });
  });

  describe(`${name} — chips`, () => {
    it("chips #hashtag", () => {
      expect(chipClasses(render("go #gym"))).toEqual(["hashtag-chip-inline"]);
    });

    it("chips $project", () => {
      expect(chipClasses(render("in $acme"))).toEqual(["project-chip-inline"]);
    });

    it("leaves $5 as a price", () => {
      expect(plainText(render("costs $5"))).toBe("costs $5");
    });
  });
}

describe("renderInlineMarkdown — prose", () => {
  const typesOf = (nodes: ReactNode[]) =>
    nodes.filter(isValidElement).map((n) => n.type);

  it("still renders bold, italic, and code", () => {
    expect(typesOf(renderInlineMarkdown("**b**"))).toEqual(["strong"]);
    expect(typesOf(renderInlineMarkdown("*i*"))).toEqual(["em"]);
    expect(typesOf(renderInlineMarkdown("_i_"))).toEqual(["em"]);
    expect(typesOf(renderInlineMarkdown("`c`"))).toEqual(["code"]);
  });

  it("keeps the snake_case guard on _italic_", () => {
    expect(plainText(renderInlineMarkdown("snake_case_word"))).toBe(
      "snake_case_word",
    );
  });

  it("does not pill a token inside a code span — code opens first and wins", () => {
    const nodes = renderInlineMarkdown(`\`${tok("x")}\``);
    expect(pillRefs(nodes)).toHaveLength(0);
    expect(typesOf(nodes)).toEqual(["code"]);
  });

  it("pills a token adjacent to a code span", () => {
    expect(pillRefs(renderInlineMarkdown(`\`code\` ${tok("x")}`))).toHaveLength(
      1,
    );
  });
});

describe("renderUserText — verbatim", () => {
  // A user's typed command is not reformatted; only their mentions are chips.
  it("leaves bold/italic/code markers literal", () => {
    expect(plainText(renderUserText("**b** *i* `c`"))).toBe("**b** *i* `c`");
  });

  it("pills a token that sits inside backticks, since there is no code rule", () => {
    // The divergence from renderInlineMarkdown is intentional: nothing here
    // consumes the backticks, so the token is reached and chipped.
    expect(pillRefs(renderUserText(`\`${tok("x")}\``))).toHaveLength(1);
  });
});
