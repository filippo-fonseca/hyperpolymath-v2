import { describe, expect, it } from "vitest";
import { isKnownFrameBlocker, normalizeBrowserUrl, twitterStatusId } from "../browser-embed";

describe("browser embed helpers", () => {
  it("normalizes a missing scheme to https", () => {
    expect(normalizeBrowserUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeBrowserUrl("javascript:alert(1)")).toBeNull();
  });

  it("recognizes exact and subdomain blockers without suffix spoofing", () => {
    expect(isKnownFrameBlocker("https://www.google.com/search?q=x")).toBe(true);
    expect(isKnownFrameBlocker("https://m.facebook.com/")).toBe(true);
    expect(isKnownFrameBlocker("https://notgoogle.com/")).toBe(false);
  });

  it("extracts X and Twitter status ids", () => {
    expect(twitterStatusId("https://x.com/user/status/12345")).toBe("12345");
    expect(twitterStatusId("https://twitter.com/user/statuses/9")).toBe("9");
  });
});
