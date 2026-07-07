import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetActiveWidgets,
  activateWidget,
  collapseAll,
  getActiveWidgets,
  pageActiveWidget,
  subscribeActiveWidgets,
} from "../active-widget";

describe("active-widget store", () => {
  beforeEach(() => {
    __resetActiveWidgets();
  });

  it("starts empty", () => {
    expect(getActiveWidgets()).toEqual([]);
  });

  it("activateWidget focuses a single id", () => {
    activateWidget("tasks");
    expect(getActiveWidgets()).toEqual(["tasks"]);
  });

  it("activateWidget replaces the focused id (MVP single-focus)", () => {
    activateWidget("tasks");
    activateWidget("habits");
    expect(getActiveWidgets()).toEqual(["habits"]);
  });

  it("collapseAll clears focus", () => {
    activateWidget("journal");
    collapseAll();
    expect(getActiveWidgets()).toEqual([]);
  });

  it("notifies subscribers on real changes, and is a no-op when unchanged", () => {
    let calls = 0;
    const unsub = subscribeActiveWidgets(() => {
      calls += 1;
    });

    activateWidget("tasks"); // change → notify
    activateWidget("tasks"); // same id → no-op
    collapseAll(); // change → notify
    collapseAll(); // already empty → no-op

    unsub();
    activateWidget("captures"); // after unsub → no notify

    expect(calls).toBe(2);
  });

  it("keeps a stable snapshot reference until it changes", () => {
    const a = getActiveWidgets();
    expect(getActiveWidgets()).toBe(a);
    activateWidget("agenda");
    expect(getActiveWidgets()).not.toBe(a);
  });
});

describe("pageActiveWidget", () => {
  beforeEach(() => {
    __resetActiveWidgets();
  });

  it("is a no-op when nothing is focused", () => {
    let calls = 0;
    subscribeActiveWidgets(() => {
      calls += 1;
    });

    pageActiveWidget("next");
    pageActiveWidget("prev");

    expect(getActiveWidgets()).toEqual([]);
    expect(calls).toBe(0);
  });

  it("pages to the next widget in canonical order", () => {
    activateWidget("tasks");
    pageActiveWidget("next");
    expect(getActiveWidgets()).toEqual(["captures"]);
  });

  it("pages to the previous widget in canonical order", () => {
    activateWidget("captures");
    pageActiveWidget("prev");
    expect(getActiveWidgets()).toEqual(["tasks"]);
  });

  it("wraps at the ends (next from last, prev from first)", () => {
    activateWidget("journal");
    pageActiveWidget("next");
    expect(getActiveWidgets()).toEqual(["tasks"]);

    activateWidget("tasks");
    pageActiveWidget("prev");
    expect(getActiveWidgets()).toEqual(["journal"]);
  });

  it("notifies subscribers exactly once per page", () => {
    activateWidget("tasks");
    let calls = 0;
    subscribeActiveWidgets(() => {
      calls += 1;
    });

    pageActiveWidget("next"); // → captures
    pageActiveWidget("next"); // → agenda

    expect(calls).toBe(2);
    expect(getActiveWidgets()).toEqual(["agenda"]);
  });

  it("returns to the start after a full lap of five next pages", () => {
    activateWidget("tasks");
    for (let step = 0; step < 5; step += 1) pageActiveWidget("next");
    expect(getActiveWidgets()).toEqual(["tasks"]);
  });
});
