import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_DISMISS_MS, SENT_DISMISS_MS } from "./machine";
import { createFlowPillStore, type FlowPillOutboundEffect } from "./store";
import { createLevelBus } from "./level-bus";
import type { FlowPillState } from "./types";

function collect() {
  const effects: FlowPillOutboundEffect[] = [];
  const states: FlowPillState[] = [];
  const store = createFlowPillStore();
  store.onEffect((effect) => effects.push(effect));
  store.subscribe((state) => states.push(state));
  return { store, effects, states };
}

describe("flow pill store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards the controller's effects and swallows the fade timing", () => {
    const { store, effects } = collect();
    store.dispatch({ type: "invoke", mode: "hold" });
    store.dispatch({ type: "capture-started" });
    store.dispatch({ type: "end" });
    store.dispatch({ type: "transcript", text: "book the lab bench" });
    store.dispatch({ type: "sent" });

    expect(effects).toEqual([
      { type: "show" },
      { type: "start-capture", mode: "hold" },
      { type: "stop-capture" },
      { type: "send", text: "book the lab bench" },
    ]);
    expect(effects.some((e) => e.type === "dismiss-after")).toBe(false);
    store.destroy();
  });

  it("clears the sent confirmation on its own after the fade", () => {
    const { store, effects } = collect();
    store.dispatch({ type: "invoke", mode: "hold" });
    store.dispatch({ type: "capture-started" });
    store.dispatch({ type: "end" });
    store.dispatch({ type: "transcript", text: "hello" });
    store.dispatch({ type: "sent" });
    expect(store.getState().status).toBe("sent");

    vi.advanceTimersByTime(SENT_DISMISS_MS - 1);
    expect(store.getState().status).toBe("sent");

    vi.advanceTimersByTime(1);
    expect(store.getState().status).toBe("idle");
    expect(effects.at(-1)).toEqual({ type: "hide" });
    store.destroy();
  });

  it("clears an error on its own, on the longer error fade", () => {
    const { store } = collect();
    store.dispatch({ type: "invoke", mode: "locked" });
    store.dispatch({ type: "fail", reason: "Microphone blocked" });
    expect(store.getState().error).toBe("Microphone blocked");

    vi.advanceTimersByTime(ERROR_DISMISS_MS - 1);
    expect(store.getState().status).toBe("error");
    vi.advanceTimersByTime(1);
    expect(store.getState().status).toBe("idle");
    store.destroy();
  });

  it("does not let a stale fade timer hide the window mid-utterance", () => {
    // The bug this guards: invoke again during the `sent` confirmation and the
    // old timer, still armed, fires `dismiss` while the user is speaking.
    const { store, effects } = collect();
    store.dispatch({ type: "invoke", mode: "hold" });
    store.dispatch({ type: "capture-started" });
    store.dispatch({ type: "end" });
    store.dispatch({ type: "transcript", text: "first" });
    store.dispatch({ type: "sent" });

    vi.advanceTimersByTime(SENT_DISMISS_MS / 2);
    store.dispatch({ type: "invoke", mode: "locked" });
    store.dispatch({ type: "capture-started" });

    vi.advanceTimersByTime(SENT_DISMISS_MS * 4);
    expect(store.getState().status).toBe("listening");
    expect(effects.filter((e) => e.type === "hide")).toEqual([]);
    store.destroy();
  });

  it("notifies state subscribers only when the state actually moves", () => {
    const { store, states } = collect();
    store.dispatch({ type: "invoke", mode: "hold" });
    store.dispatch({ type: "sent" }); // illegal here, ignored
    store.dispatch({ type: "capture-started" });
    expect(states.map((s) => s.status)).toEqual(["armed", "listening"]);
    store.destroy();
  });

  it("stops scheduling once destroyed", () => {
    const { store, effects } = collect();
    store.dispatch({ type: "invoke", mode: "hold" });
    store.destroy();
    const before = effects.length;
    store.dispatch({ type: "cancel" });
    expect(effects.length).toBe(before);
  });
});

describe("level bus", () => {
  it("clamps into 0..1 and drops NaN", () => {
    const bus = createLevelBus();
    const seen: number[] = [];
    bus.onLevel((level) => seen.push(level));
    for (const level of [0, 0.42, 1, -3, 7, Number.NaN, Number.POSITIVE_INFINITY]) {
      bus.push(level);
    }
    expect(seen).toEqual([0, 0.42, 1, 0, 1]);
  });

  it("pipes an upstream capture source and detaches cleanly", () => {
    const bus = createLevelBus();
    const upstream = createLevelBus();
    const seen: number[] = [];
    bus.onLevel((level) => seen.push(level));

    const detach = bus.pipe(upstream);
    upstream.push(0.5);
    detach();
    upstream.push(0.9);

    expect(seen).toEqual([0.5]);
  });

  it("survives a listener that unsubscribes itself mid-frame", () => {
    const bus = createLevelBus();
    const seen: number[] = [];
    const off = bus.onLevel((level) => {
      seen.push(level);
      off();
    });
    bus.onLevel((level) => seen.push(level));
    expect(() => bus.push(0.3)).not.toThrow();
    bus.push(0.6);
    expect(seen).toEqual([0.3, 0.3, 0.6]);
  });
});
