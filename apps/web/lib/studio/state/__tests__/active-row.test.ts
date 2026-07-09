import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveRow,
  getFrontRow,
  subscribeFrontRow,
  toggleFrontRow,
} from "../active-row";

describe("active-row store", () => {
  beforeEach(() => {
    __resetActiveRow();
  });

  describe("initial state", () => {
    it("starts with front row 0", () => {
      expect(getFrontRow()).toBe(0);
    });
  });

  describe("toggleFrontRow", () => {
    it("flips 0 → 1 → 0 on successive toggles", () => {
      toggleFrontRow();
      expect(getFrontRow()).toBe(1);
      toggleFrontRow();
      expect(getFrontRow()).toBe(0);
    });
  });

  describe("subscription", () => {
    it("notifies subscribers once per toggle", () => {
      const cb = vi.fn();
      subscribeFrontRow(cb);
      toggleFrontRow();
      expect(cb).toHaveBeenCalledTimes(1);
      toggleFrontRow();
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("stops notifying after unsubscribe", () => {
      const cb = vi.fn();
      const unsub = subscribeFrontRow(cb);
      toggleFrontRow();
      unsub();
      toggleFrontRow();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("__resetActiveRow", () => {
    it("restores front row 0 and clears subscribers", () => {
      const cb = vi.fn();
      subscribeFrontRow(cb);
      toggleFrontRow();
      __resetActiveRow();
      expect(getFrontRow()).toBe(0);
      toggleFrontRow();
      // subscriber cleared by reset → not called again after the reset
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
