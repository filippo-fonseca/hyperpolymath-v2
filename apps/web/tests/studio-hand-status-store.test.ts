import { afterEach, describe, expect, it, vi } from "vitest";

import type { HandDriverStatus } from "@/lib/studio/input/drivers/hand";
import {
  __resetHandStatus,
  getHandStatus,
  publishHandStatus,
  subscribeHandStatus,
} from "@/lib/studio/state/hand-status";

afterEach(() => {
  __resetHandStatus();
});

describe("hand-status store", () => {
  it("starts null and reflects published status", () => {
    expect(getHandStatus()).toBeNull();

    const running: HandDriverStatus = { state: "running", handVisible: true };
    publishHandStatus(running);
    expect(getHandStatus()).toBe(running);

    publishHandStatus(null);
    expect(getHandStatus()).toBeNull();
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeHandStatus(cb);

    publishHandStatus({ state: "loading-model" });
    expect(cb).toHaveBeenCalledTimes(1);

    publishHandStatus({ state: "awaiting-permission" });
    expect(cb).toHaveBeenCalledTimes(2);

    unsubscribe();
    publishHandStatus({ state: "running", handVisible: false });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("identity-guards: republishing the same reference does not emit", () => {
    const cb = vi.fn();
    subscribeHandStatus(cb);

    const status: HandDriverStatus = { state: "running", handVisible: true };
    publishHandStatus(status);
    publishHandStatus(status);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("__resetHandStatus clears state and subscribers", () => {
    const cb = vi.fn();
    subscribeHandStatus(cb);
    publishHandStatus({ state: "running", handVisible: true });
    expect(cb).toHaveBeenCalledTimes(1);

    __resetHandStatus();
    expect(getHandStatus()).toBeNull();

    // Subscriber was cleared — no further notifications.
    publishHandStatus({ state: "loading-model" });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
