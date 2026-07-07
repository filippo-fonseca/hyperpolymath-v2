import { describe, expect, it, vi } from "vitest";

import { StudioInputHub } from "@/lib/studio/input/hub";
import type {
  HoverProvider,
  StudioDriverEnv,
  StudioInputDriver,
  StudioInputSink,
  StudioIntent,
  StudioPhaseEvent,
} from "@/lib/studio/input/types";

function makeHub(stage = { left: 0, top: 0, width: 1000, height: 500 }) {
  return new StudioInputHub({
    sync: true,
    getStageRect: () => stage,
  });
}

function domRect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON() {},
  } as DOMRect;
}

describe("StudioInputHub — cursor", () => {
  it("clamps and derives px from the stage rect", () => {
    const hub = makeHub();
    hub.sink.moveCursor(0.5, 0.5);
    const c = hub.getSnapshot().cursor;
    expect(c.nx).toBe(0.5);
    expect(c.ny).toBe(0.5);
    expect(c.x).toBe(500);
    expect(c.y).toBe(250);
    expect(c.active).toBe(true);
  });

  it("clamps out-of-range normalized coords into [0,1]", () => {
    const hub = makeHub();
    hub.sink.moveCursor(1.5, -0.5);
    const c = hub.getSnapshot().cursor;
    expect(c.nx).toBe(1);
    expect(c.ny).toBe(0);
  });

  it("keeps snapshot identity stable when nothing changes", () => {
    const hub = makeHub();
    hub.sink.moveCursor(0.5, 0.5);
    const first = hub.getSnapshot();
    hub.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot()).toBe(first);
  });

  it("notifies store subscribers on cursor change", () => {
    const hub = makeHub();
    const cb = vi.fn();
    hub.subscribe(cb);
    hub.sink.moveCursor(0.2, 0.2);
    expect(cb).toHaveBeenCalled();
  });
});

describe("StudioInputHub — hover resolution", () => {
  const providerFor = (id: string, priority: number, ret: string | null): HoverProvider => ({
    id,
    priority,
    resolve: () => ret,
  });

  it("higher priority provider wins", () => {
    const hub = makeHub();
    hub.registerHoverProvider(providerFor("low", 0, "low-target"));
    hub.registerHoverProvider(providerFor("high", 10, "high-target"));
    hub.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot().hoverTargetId).toBe("high-target");
  });

  it("falls through to lower priority when higher returns null", () => {
    const hub = makeHub();
    hub.registerHoverProvider(providerFor("low", 0, "low-target"));
    hub.registerHoverProvider(providerFor("high", 10, null));
    hub.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot().hoverTargetId).toBe("low-target");
  });

  it("notifies subscribers exactly once on a hover change", () => {
    const hub = makeHub();
    const p = providerFor("p", 5, "t");
    const cb = vi.fn();
    hub.registerHoverProvider(p);
    hub.sink.moveCursor(0.5, 0.5); // active + hover resolves -> notifications
    cb.mockClear();
    hub.subscribe(cb);
    hub.sink.moveCursor(0.6, 0.6); // hover unchanged ("t"), cursor changed
    // cursor changed so store notified; hover did NOT change again.
    expect(hub.getSnapshot().hoverTargetId).toBe("t");
  });

  it("unregistering the higher provider restores the lower one", () => {
    const hub = makeHub();
    hub.registerHoverProvider(providerFor("low", 0, "low-target"));
    const unreg = hub.registerHoverProvider(providerFor("high", 10, "high-target"));
    hub.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot().hoverTargetId).toBe("high-target");
    unreg();
    expect(hub.getSnapshot().hoverTargetId).toBe("low-target");
  });

  it("resolves to null when cursor is inactive", () => {
    const hub = makeHub();
    hub.registerHoverProvider(providerFor("p", 5, "t"));
    hub.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot().hoverTargetId).toBe("t");
    hub.sink.setCursorActive(false);
    expect(hub.getSnapshot().hoverTargetId).toBeNull();
  });
});

describe("StudioInputHub — built-in DOM provider", () => {
  it("hit-tests registered rects against stage-relative cursor px", () => {
    const hub = makeHub({ left: 100, top: 50, width: 1000, height: 500 });
    // rect A occupies viewport x[150..250], y[80..120]
    hub.registerDomTarget("a", () => domRect(150, 80, 250, 120));
    hub.registerDomTarget("b", () => domRect(400, 300, 500, 350));

    // cursor at nx=0.1 -> px 100 (stage-relative) -> viewport 100+100=200, in A x-range
    // ny at (100-50)/500 = 0.1 -> py 50 -> viewport 50+50=100, in A y-range
    hub.sink.moveCursor(0.1, 0.1);
    expect(hub.getSnapshot().hoverTargetId).toBe("a");
  });

  it("returns null when the cursor is outside all rects", () => {
    const hub = makeHub({ left: 0, top: 0, width: 1000, height: 500 });
    hub.registerDomTarget("a", () => domRect(10, 10, 20, 20));
    hub.sink.moveCursor(0.9, 0.9); // px (900,450) -> far from rect
    expect(hub.getSnapshot().hoverTargetId).toBeNull();
  });

  it("unregistering a DOM target clears the hover", () => {
    const hub = makeHub({ left: 0, top: 0, width: 1000, height: 500 });
    const unreg = hub.registerDomTarget("a", () => domRect(0, 0, 1000, 500));
    hub.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot().hoverTargetId).toBe("a");
    unreg();
    expect(hub.getSnapshot().hoverTargetId).toBeNull();
  });
});

describe("StudioInputHub — intent bus", () => {
  it("upgrades expand with the current hover target", () => {
    const hub = makeHub();
    hub.registerHoverProvider({ id: "p", priority: 5, resolve: () => "widget-3" });
    hub.sink.moveCursor(0.5, 0.5);
    const got: StudioIntent[] = [];
    hub.subscribeIntent((i) => got.push(i));
    hub.sink.emitIntent({ type: "expand" });
    expect(got).toEqual([{ type: "expand", targetId: "widget-3" }]);
  });

  it("drops expand when no hover target is resolved", () => {
    const hub = makeHub();
    hub.sink.moveCursor(0.5, 0.5); // no providers besides DOM (empty) -> null hover
    const cb = vi.fn();
    hub.subscribeIntent(cb);
    hub.sink.emitIntent({ type: "expand" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("passes collapse and swipes through unchanged", () => {
    const hub = makeHub();
    const got: StudioIntent[] = [];
    hub.subscribeIntent((i) => got.push(i));
    hub.sink.emitIntent({ type: "collapse" });
    hub.sink.emitIntent({ type: "swipeLeft" });
    hub.sink.emitIntent({ type: "swipeRight" });
    expect(got).toEqual([
      { type: "collapse" },
      { type: "swipeLeft" },
      { type: "swipeRight" },
    ]);
  });

  it("passes the targetless halt intent through unchanged", () => {
    const hub = makeHub();
    const got: StudioIntent[] = [];
    hub.subscribeIntent((i) => got.push(i));
    hub.sink.emitIntent({ type: "halt" });
    expect(got).toEqual([{ type: "halt" }]);
  });

  it("stops delivering after unsubscribe", () => {
    const hub = makeHub();
    const cb = vi.fn();
    const unsub = hub.subscribeIntent(cb);
    unsub();
    hub.sink.emitIntent({ type: "collapse" });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("StudioInputHub — phase bus", () => {
  it("upgrades grabStart with the current hover target", () => {
    const hub = makeHub();
    hub.registerHoverProvider({ id: "p", priority: 5, resolve: () => "widget-7" });
    hub.sink.moveCursor(0.5, 0.5);
    const got: StudioPhaseEvent[] = [];
    hub.subscribePhase((e) => got.push(e));
    hub.sink.emitPhase({ type: "grabStart" });
    hub.sink.emitPhase({ type: "grabMove", nx: 0.6, ny: 0.4 });
    hub.sink.emitPhase({ type: "grabEnd" });
    expect(got).toEqual([
      { type: "grabStart", targetId: "widget-7" },
      { type: "grabMove", nx: 0.6, ny: 0.4 },
      { type: "grabEnd" },
    ]);
  });

  it("drops the whole grab lifecycle when grabStart has no hover target", () => {
    const hub = makeHub();
    hub.sink.moveCursor(0.5, 0.5); // no non-DOM providers → null hover
    const cb = vi.fn();
    hub.subscribePhase(cb);
    hub.sink.emitPhase({ type: "grabStart" });
    hub.sink.emitPhase({ type: "grabMove", nx: 0.6, ny: 0.4 });
    hub.sink.emitPhase({ type: "grabEnd" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("re-delivers a fresh grab after a suppressed one ends", () => {
    const hub = makeHub();
    const provider = { id: "p", priority: 5, resolve: (): string | null => null };
    hub.registerHoverProvider(provider);
    hub.sink.moveCursor(0.5, 0.5);
    const got: StudioPhaseEvent[] = [];
    hub.subscribePhase((e) => got.push(e));

    // First grab: no target → suppressed.
    hub.sink.emitPhase({ type: "grabStart" });
    hub.sink.emitPhase({ type: "grabEnd" });
    expect(got).toEqual([]);

    // Now a target exists; a new grab must deliver normally.
    (provider as { resolve: () => string | null }).resolve = () => "widget-2";
    hub.sink.moveCursor(0.51, 0.51); // re-resolve hover
    hub.sink.emitPhase({ type: "grabStart" });
    hub.sink.emitPhase({ type: "grabEnd" });
    expect(got).toEqual([
      { type: "grabStart", targetId: "widget-2" },
      { type: "grabEnd" },
    ]);
  });

  it("passes drag and pull phases through untouched", () => {
    const hub = makeHub();
    const got: StudioPhaseEvent[] = [];
    hub.subscribePhase((e) => got.push(e));
    hub.sink.emitPhase({ type: "dragStart" });
    hub.sink.emitPhase({ type: "dragMove", dx: 0.1, dy: -0.2, dz: 0.05 });
    hub.sink.emitPhase({ type: "dragEnd" });
    hub.sink.emitPhase({ type: "pullStart" });
    hub.sink.emitPhase({ type: "pullDelta", delta: 0.3 });
    hub.sink.emitPhase({ type: "pullEnd" });
    expect(got).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0.1, dy: -0.2, dz: 0.05 },
      { type: "dragEnd" },
      { type: "pullStart" },
      { type: "pullDelta", delta: 0.3 },
      { type: "pullEnd" },
    ]);
  });

  it("stops delivering phases after unsubscribe", () => {
    const hub = makeHub();
    const cb = vi.fn();
    const unsub = hub.subscribePhase(cb);
    unsub();
    hub.sink.emitPhase({ type: "dragStart" });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("StudioInputHub — driver lifecycle", () => {
  it("registerDriver starts the driver with a working sink and env", () => {
    const hub = makeHub({ left: 0, top: 0, width: 200, height: 100 });
    let captured: { sink: StudioInputSink; env: StudioDriverEnv } | null = null;
    const stop = vi.fn();
    const driver: StudioInputDriver = {
      id: "test",
      start(sink, env) {
        captured = { sink, env };
      },
      stop,
    };
    const unreg = hub.registerDriver(driver);
    expect(captured).not.toBeNull();
    // sink drives the hub:
    captured!.sink.moveCursor(0.5, 0.5);
    expect(hub.getSnapshot().cursor.x).toBe(100);
    // env exposes the stage rect:
    expect(captured!.env.getStageRect().width).toBe(200);
    unreg();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
