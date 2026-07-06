import { describe, it, expect } from "vitest";
import {
  classifyMediaType,
  faviconFor,
  isTwitterStatusUrl,
  siteNameFrom,
  youtubeVideoId,
} from "@/lib/link-preview/classify";
import { fetchLinkPreview } from "@/lib/link-preview/fetch";

describe("youtubeVideoId", () => {
  it("parses watch, youtu.be, shorts, and embed URLs", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtube.com/shorts/abc123XYZ")).toBe("abc123XYZ");
    expect(youtubeVideoId("https://www.youtube.com/embed/abc123XYZ")).toBe("abc123XYZ");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(youtubeVideoId("https://example.com/watch?v=nope")).toBeNull();
    expect(youtubeVideoId("not a url")).toBeNull();
  });
});

describe("isTwitterStatusUrl", () => {
  it("matches x.com and twitter.com status URLs", () => {
    expect(isTwitterStatusUrl("https://x.com/jack/status/20")).toBe(true);
    expect(isTwitterStatusUrl("https://twitter.com/jack/status/20")).toBe(true);
    expect(isTwitterStatusUrl("https://x.com/jack")).toBe(false);
  });
});

describe("classifyMediaType", () => {
  it("routes to youtube / twitter / generic", () => {
    expect(classifyMediaType("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(classifyMediaType("https://x.com/a/status/1")).toBe("twitter");
    expect(classifyMediaType("https://example.com/article")).toBe("generic");
  });
});

describe("faviconFor / siteNameFrom", () => {
  it("derives a favicon URL and a clean site label", () => {
    expect(faviconFor("https://www.example.com/x")).toContain("example.com");
    expect(siteNameFrom("https://www.example.com/x")).toBe("example.com");
    expect(siteNameFrom("garbage")).toBeNull();
  });
});

describe("fetchLinkPreview error handling", () => {
  it("degrades gracefully on an invalid URL without throwing", async () => {
    const r = await fetchLinkPreview("javascript:alert(1)");
    expect(r.status).toBe("error");
    expect(r.error).toBeTruthy();
  });
});
