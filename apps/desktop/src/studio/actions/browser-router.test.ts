import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetWidgetWindows,
  getWidgetWindows,
} from "../state/widget-windows";
import {
  __resetBrowserRouter,
  __setBrowserRouterClock,
  isStudioAvailable,
  markStudioAvailable,
  noteBrowserUrl,
  openBrowserUrl,
} from "./browser-router";

// A controllable clock so the cross-turn recency window can be advanced
// deterministically. Installed fresh each test after __resetBrowserRouter
// (which restores the real Date.now clock).
let clock = 0;
beforeEach(() => {
  __resetWidgetWindows();
  __resetBrowserRouter();
  clock = 0;
  __setBrowserRouterClock(() => clock);
});

describe("browser-router: studio availability", () => {
  it("starts unavailable and flips on markStudioAvailable", () => {
    expect(isStudioAvailable()).toBe(false);
    markStudioAvailable();
    expect(isStudioAvailable()).toBe(true);
  });
});

describe("browser-router: per-turn dedupe", () => {
  it("opens a browser widget for a URL", () => {
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    expect(getWidgetWindows()).toHaveLength(1);
    expect(getWidgetWindows()[0]).toMatchObject({
      kind: "browser",
      props: { url: "https://example.com/a" },
    });
  });

  it("does not open the same URL twice in one turn", () => {
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(1);
  });

  it("treats spelling variants of the same URL as duplicates", () => {
    // Trailing-slash / href normalization: same page, one widget.
    expect(openBrowserUrl("https://example.com", "turn-1")).toBe(true);
    expect(openBrowserUrl("https://example.com/", "turn-1")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(1);
  });

  it("suppresses an open_url after a studio-action noted the same URL", () => {
    // Simulates studio_open_widget opening the browser first (noteBrowserUrl),
    // then the sibling open_url tool-call for the same page being deduped.
    noteBrowserUrl("https://example.com/live");
    expect(openBrowserUrl("https://example.com/live")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(0);
  });

  it("opens distinct URLs within the same turn", () => {
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    expect(openBrowserUrl("https://example.com/b", "turn-1")).toBe(true);
    expect(getWidgetWindows()).toHaveLength(2);
  });
});

describe("browser-router: cross-turn recency window", () => {
  it("suppresses the same URL across two turnIds within the window", () => {
    // The defect: one spoken query fans out into two server turns. Different
    // turnIds → different per-turn buckets, so layer A lets both through. The
    // cross-turn recency window must collapse them to a single widget.
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    clock += 2_000; // a couple seconds later, the second turn arrives
    expect(openBrowserUrl("https://example.com/a", "turn-2")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(1);
  });

  it("suppresses the same URL for a turn-less caller within the window", () => {
    // The studio-action path carries no turnId; a sibling tool-call arrives
    // under a real turnId. Only the recency window can bridge them.
    expect(openBrowserUrl("https://example.com/a")).toBe(true);
    clock += 1_000;
    expect(openBrowserUrl("https://example.com/a", "turn-9")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(1);
  });

  it("allows the same URL again once the window has expired", () => {
    // A deliberate re-open a while later still works — the window is short.
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    clock += 15_001; // just past the 15s window
    expect(openBrowserUrl("https://example.com/a", "turn-2")).toBe(true);
    expect(getWidgetWindows()).toHaveLength(2);
  });

  it("does not suppress two genuinely different URLs seen back-to-back", () => {
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    clock += 500;
    expect(openBrowserUrl("https://example.com/b", "turn-2")).toBe(true);
    expect(getWidgetWindows()).toHaveLength(2);
  });

  it("keeps distinct search queries as distinct widgets within the window", () => {
    // web_search maps to https://www.google.com/search?q=… server-side, so the
    // query string is load-bearing: two different searches are two widgets.
    const a = "https://www.google.com/search?q=world+cup+today";
    const b = "https://www.google.com/search?q=england+score";
    expect(openBrowserUrl(a, "turn-1")).toBe(true);
    clock += 1_000;
    expect(openBrowserUrl(b, "turn-2")).toBe(true);
    expect(getWidgetWindows()).toHaveLength(2);
    // …but the SAME search across turns within the window is one widget.
    clock += 1_000;
    expect(openBrowserUrl(a, "turn-3")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(2);
  });

  it("suppresses a studio-action + tool-call for the same URL across turnIds", () => {
    // studio_open_widget(browser) notes the URL turn-lessly (no summon), then
    // the model's sibling open_url tool-call arrives under a real turnId. End
    // state: exactly one browser widget.
    noteBrowserUrl("https://example.com/live"); // studio-action path
    clock += 800;
    expect(openBrowserUrl("https://example.com/live", "turn-7")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(0);
  });

  it("keeps suppressing within a rolling window as repeats refresh it", () => {
    // Each duplicate attempt refreshes the recency stamp, so a steady drip of
    // re-attempts inside the window never leaks a second widget.
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    clock += 10_000;
    expect(openBrowserUrl("https://example.com/a", "turn-2")).toBe(false);
    clock += 10_000; // 20s after the first open, but only 10s after the refresh
    expect(openBrowserUrl("https://example.com/a", "turn-3")).toBe(false);
    expect(getWidgetWindows()).toHaveLength(1);
  });
});
