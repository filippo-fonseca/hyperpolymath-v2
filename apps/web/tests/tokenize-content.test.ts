import { describe, expect, it } from "vitest";

import { tokenizeContent } from "@/lib/captures/tokenize-content";

describe("tokenizeContent — hashtags", () => {
  it("pills a bare #tag", () => {
    expect(tokenizeContent("hello #idea world")).toEqual([
      { kind: "text", value: "hello " },
      { kind: "hashtag", display: "idea" },
      { kind: "text", value: " world" },
    ]);
  });

  it("pills tags with adjacent trailing punctuation (the reported bug)", () => {
    expect(tokenizeContent("ship it #now, please")).toEqual([
      { kind: "text", value: "ship it " },
      { kind: "hashtag", display: "now" },
      { kind: "text", value: ", please" },
    ]);
  });

  it("pills a tag wrapped in parentheses", () => {
    expect(tokenizeContent("(#wip)")).toEqual([
      { kind: "text", value: "(" },
      { kind: "hashtag", display: "wip" },
      { kind: "text", value: ")" },
    ]);
  });

  it("does not treat #-after-word as a tag (boundary rule)", () => {
    expect(tokenizeContent("c#sharp")).toEqual([{ kind: "text", value: "c#sharp" }]);
  });

  it("uses displayName casing from the lookup", () => {
    const lookup = new Map([["idea", "Idea"]]);
    expect(tokenizeContent("#idea", { hashtagDisplay: lookup })).toEqual([
      { kind: "hashtag", display: "Idea" },
    ]);
  });
});

describe("tokenizeContent — people", () => {
  const personNames = ["John Smith", "Jo"];

  it("pills a known @person (longest-match wins over a shorter name)", () => {
    expect(tokenizeContent("met @John Smith today", { personNames })).toEqual([
      { kind: "text", value: "met " },
      { kind: "person", display: "John Smith" },
      { kind: "text", value: " today" },
    ]);
  });

  it("leaves raw @ that does not match a known person (emails) as text", () => {
    expect(tokenizeContent("ping me@x.com", { personNames })).toEqual([
      { kind: "text", value: "ping me@x.com" },
    ]);
  });

  it("does not pill @people when no person list is supplied", () => {
    expect(tokenizeContent("hi @John Smith")).toEqual([
      { kind: "text", value: "hi @John Smith" },
    ]);
  });

  it("matches a person name case-insensitively but keeps canonical casing", () => {
    expect(tokenizeContent("@jo waved", { personNames })).toEqual([
      { kind: "person", display: "Jo" },
      { kind: "text", value: " waved" },
    ]);
  });
});
