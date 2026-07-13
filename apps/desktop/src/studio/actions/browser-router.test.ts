import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetWidgetWindows,
  getWidgetWindows,
} from "../state/widget-windows";
import {
  __resetBrowserRouter,
  isStudioAvailable,
  markStudioAvailable,
  noteBrowserUrl,
  openBrowserUrl,
} from "./browser-router";

beforeEach(() => {
  __resetWidgetWindows();
  __resetBrowserRouter();
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

  it("opens the same URL again in a different turn", () => {
    expect(openBrowserUrl("https://example.com/a", "turn-1")).toBe(true);
    expect(openBrowserUrl("https://example.com/a", "turn-2")).toBe(true);
    expect(getWidgetWindows()).toHaveLength(2);
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
