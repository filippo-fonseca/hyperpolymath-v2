import { describe, expect, it } from "vitest";
import { classifyLinkEmbed, isEmptyParagraph, linkDomain, pastedHttpUrl } from "../link-embed";

describe("wiki link embeds", () => {
  it("accepts exactly one HTTP(S) URL from the clipboard", () => {
    expect(pastedHttpUrl(" https://example.com/path ")).toBe("https://example.com/path");
    expect(pastedHttpUrl("http://example.com")).toBe("http://example.com/");
    expect(pastedHttpUrl("javascript:alert(1)")).toBeNull();
    expect(pastedHttpUrl("https://one.test https://two.test")).toBeNull();
    expect(pastedHttpUrl("some text")).toBeNull();
  });

  it("only treats an empty paragraph as an eligible paste target", () => {
    expect(isEmptyParagraph({ type: "paragraph", content: [] })).toBe(true);
    expect(isEmptyParagraph({ type: "paragraph", content: [{ type: "text" }] })).toBe(false);
    expect(isEmptyParagraph({ type: "heading", content: [] })).toBe(false);
  });

  it("classifies rich providers and extracts YouTube ids", () => {
    expect(classifyLinkEmbed("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      mediaType: "youtube",
      youtubeId: "dQw4w9WgXcQ",
    });
    expect(classifyLinkEmbed("https://x.com/user/status/123456").mediaType).toBe("twitter");
    expect(classifyLinkEmbed("https://example.com").mediaType).toBe("generic");
    expect(linkDomain("https://www.example.com/a")).toBe("example.com");
  });
});
