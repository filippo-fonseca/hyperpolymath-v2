import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetActiveWidgets,
  activateWidget,
  collapseAll,
  getActiveWidgets,
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
