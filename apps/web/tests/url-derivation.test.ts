import { describe, expect, it } from "vitest";

import { deriveSingleUrl, extractUrlsFromContent, mergeContentUrls } from "@/lib/url";

describe("extractUrlsFromContent", () => {
  it("returns [] for empty / null / link-free content", () => {
    expect(extractUrlsFromContent("")).toEqual([]);
    expect(extractUrlsFromContent(null)).toEqual([]);
    expect(extractUrlsFromContent(undefined)).toEqual([]);
    expect(extractUrlsFromContent("just some notes, nothing linky")).toEqual([]);
  });

  it("extracts an https link embedded in body text (the reported case)", () => {
    expect(
      extractUrlsFromContent(
        "okay, I finally understood pull up and pull down resistors! https://www.youtube.com/watch?v=_8HYjjaT7BM #idea",
      ),
    ).toEqual(["https://www.youtube.com/watch?v=_8HYjjaT7BM"]);
  });

  it("prefixes https:// onto scheme-less www. links (keeping the www.)", () => {
    expect(extractUrlsFromContent("see www.example.com/path for more")).toEqual([
      "https://www.example.com/path",
    ]);
  });

  it("strips trailing sentence punctuation off a link", () => {
    expect(extractUrlsFromContent("read https://example.com/post.")).toEqual([
      "https://example.com/post",
    ]);
  });

  it("returns every distinct link in first-seen order", () => {
    expect(
      extractUrlsFromContent("first https://a.com/x then https://b.com/y done"),
    ).toEqual(["https://a.com/x", "https://b.com/y"]);
  });

  it("de-duplicates the same link case-insensitively", () => {
    expect(
      extractUrlsFromContent("https://Example.com/A and again https://example.com/A"),
    ).toEqual(["https://example.com/A"]);
  });

  it("ignores non-http(s) schemes", () => {
    expect(extractUrlsFromContent("email me at mailto:foo@bar.com")).toEqual([]);
  });
});

describe("mergeContentUrls", () => {
  it("derives url + urls from a link in the body when nothing was set", () => {
    expect(mergeContentUrls("check https://example.com/x out")).toEqual({
      url: "https://example.com/x",
      urls: ["https://example.com/x"],
    });
  });

  it("returns an empty state for link-free content", () => {
    expect(mergeContentUrls("no links here")).toEqual({ url: null, urls: [] });
  });

  it("never overwrites a manually-set primary url", () => {
    const result = mergeContentUrls("body has https://body.com/link", {
      url: "https://manual.com/kept",
      urls: ["https://manual.com/kept"],
    });
    expect(result.url).toBe("https://manual.com/kept");
    // ...but the body link is still added alongside it.
    expect(result.urls).toEqual(["https://manual.com/kept", "https://body.com/link"]);
  });

  it("adds a body link that differs from the existing one (multi-url)", () => {
    const result = mergeContentUrls("now also https://second.com/x", {
      url: "https://first.com/x",
      urls: ["https://first.com/x"],
    });
    expect(result.urls).toEqual(["https://first.com/x", "https://second.com/x"]);
  });

  it("never removes a recorded link even if it is no longer in the body", () => {
    const result = mergeContentUrls("body now mentions nothing", {
      url: "https://kept.com/x",
      urls: ["https://kept.com/x", "https://manual-extra.com/y"],
    });
    expect(result.urls).toEqual(["https://kept.com/x", "https://manual-extra.com/y"]);
  });

  it("does not duplicate a link already present (idempotent)", () => {
    const first = mergeContentUrls("has https://example.com/x", {});
    const second = mergeContentUrls("has https://example.com/x", first);
    expect(second).toEqual(first);
  });

  it("seeds the primary url from the first link when it was unset", () => {
    const result = mergeContentUrls("links https://a.com/1 and https://b.com/2", {
      url: null,
      urls: [],
    });
    expect(result.url).toBe("https://a.com/1");
    expect(result.urls).toEqual(["https://a.com/1", "https://b.com/2"]);
  });
});

describe("deriveSingleUrl (task / page single-url property)", () => {
  it("derives the link embedded in a task title (the reported case)", () => {
    expect(
      deriveSingleUrl(
        "Reproduce GPT-2 from Karpathy https://www.youtube.com/watch?v=l8pRSuU81PU&t=76s",
      ),
    ).toBe("https://www.youtube.com/watch?v=l8pRSuU81PU&t=76s");
  });

  it("returns null for link-free text", () => {
    expect(deriveSingleUrl("Reproduce GPT-2 from Karpathy")).toBeNull();
    expect(deriveSingleUrl("")).toBeNull();
    expect(deriveSingleUrl(null)).toBeNull();
    expect(deriveSingleUrl(undefined)).toBeNull();
  });

  it("takes the FIRST link when the text has several (single-url entity)", () => {
    expect(
      deriveSingleUrl("watch https://a.com/1 then read https://b.com/2"),
    ).toBe("https://a.com/1");
  });

  it("never overwrites an existing/manual url", () => {
    expect(
      deriveSingleUrl("now points at https://body.com/link", "https://manual.com/kept"),
    ).toBe("https://manual.com/kept");
  });

  it("fills the url only when the existing value is empty/unset", () => {
    expect(deriveSingleUrl("see https://filled.com/x", null)).toBe("https://filled.com/x");
    expect(deriveSingleUrl("see https://filled.com/x", "")).toBe("https://filled.com/x");
  });

  it("prefixes https:// onto a scheme-less www. link in the title", () => {
    expect(deriveSingleUrl("notes on www.example.com/path")).toBe(
      "https://www.example.com/path",
    );
  });
});
