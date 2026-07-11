import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetWidgetWindows,
  getWidgetWindows,
} from "../state/widget-windows";
import { routeStudioAction } from "./studio-action-router";

beforeEach(() => {
  __resetWidgetWindows();
});

describe("routeStudioAction", () => {
  it("opens a catalog widget with the supplied props", () => {
    routeStudioAction({
      action: "open",
      kind: "browser",
      props: { url: "https://example.com" },
    });

    expect(getWidgetWindows()).toHaveLength(1);
    expect(getWidgetWindows()[0]).toMatchObject({
      kind: "browser",
      props: { url: "https://example.com" },
      w: 0.42,
      h: 0.5,
    });
  });

  it("closes widgets by kind, id, or all", () => {
    routeStudioAction({ action: "open", kind: "weather" });
    routeStudioAction({ action: "open", kind: "news" });
    const newsId = getWidgetWindows().find((item) => item.kind === "news")?.id;
    expect(newsId).toBeDefined();

    routeStudioAction({ action: "close", kind: "weather", target: "kind" });
    expect(getWidgetWindows().map((item) => item.kind)).toEqual(["news"]);

    routeStudioAction({ action: "close", kind: newsId!, target: "id" });
    expect(getWidgetWindows()).toHaveLength(0);

    routeStudioAction({ action: "open", kind: "weather" });
    routeStudioAction({ action: "close", kind: "all", target: "kind" });
    expect(getWidgetWindows()).toHaveLength(0);
  });

  it("ignores unknown widget kinds", () => {
    routeStudioAction({ action: "open", kind: "unknown" });
    expect(getWidgetWindows()).toHaveLength(0);
  });
});
