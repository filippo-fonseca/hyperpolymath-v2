import { beforeEach, describe, expect, it, vi } from "vitest";

import { MouseKeyboardDriver } from "@/lib/studio/input/drivers/mouse-keyboard";
import type { StudioDriverEnv, StudioInputSink } from "@/lib/studio/input/types";

/** Minimal event-target shim capturing listeners so we can dispatch by hand. */
function makeEventTarget() {
  const listeners = new Map<string, Set<EventListener>>();
  const target: Pick<Window, "addEventListener" | "removeEventListener"> = {
    addEventListener: ((type: string, cb: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }) as Window["addEventListener"],
    removeEventListener: ((type: string, cb: EventListener) => {
      listeners.get(type)?.delete(cb);
    }) as Window["removeEventListener"],
  };
  const emit = (type: string, event: object) => {
    for (const cb of listeners.get(type) ?? []) cb(event as Event);
  };
  const count = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { target, emit, count };
}

function makeSink(): StudioInputSink & {
  moveCursor: ReturnType<typeof vi.fn>;
  setCursorActive: ReturnType<typeof vi.fn>;
  emitIntent: ReturnType<typeof vi.fn>;
} {
  return {
    moveCursor: vi.fn(),
    setCursorActive: vi.fn(),
    emitIntent: vi.fn(),
  };
}

const STAGE = { left: 100, top: 50, width: 1000, height: 500 };

describe("MouseKeyboardDriver", () => {
  let et: ReturnType<typeof makeEventTarget>;
  let sink: ReturnType<typeof makeSink>;
  let env: StudioDriverEnv;
  let driver: MouseKeyboardDriver;

  beforeEach(() => {
    et = makeEventTarget();
    sink = makeSink();
    env = { getStageRect: () => STAGE, eventTarget: et.target };
    driver = new MouseKeyboardDriver();
    driver.start(sink, env);
  });

  it("normalizes pointermove coords against the offset stage rect", () => {
    et.emit("pointermove", { clientX: 600, clientY: 300, timeStamp: 0 });
    // nx = (600-100)/1000 = 0.5 ; ny = (300-50)/500 = 0.5
    expect(sink.setCursorActive).toHaveBeenCalledWith(true);
    expect(sink.moveCursor).toHaveBeenCalledWith(0.5, 0.5);
  });

  it("marks the cursor inactive when the pointer leaves the stage", () => {
    et.emit("pointermove", { clientX: 600, clientY: 300, timeStamp: 0 });
    sink.setCursorActive.mockClear();
    et.emit("pointermove", { clientX: 5, clientY: 5, timeStamp: 10 }); // outside
    expect(sink.setCursorActive).toHaveBeenCalledWith(false);
  });

  it("plain click emits an expand intent", () => {
    et.emit("click", { button: 0, shiftKey: false });
    expect(sink.emitIntent).toHaveBeenCalledWith({ type: "expand" });
  });

  it("Escape emits collapse; Enter and Space emit expand", () => {
    et.emit("keydown", { key: "Escape", target: null });
    et.emit("keydown", { key: "Enter", target: null });
    et.emit("keydown", { key: " ", target: null });
    expect(sink.emitIntent).toHaveBeenNthCalledWith(1, { type: "collapse" });
    expect(sink.emitIntent).toHaveBeenNthCalledWith(2, { type: "expand" });
    expect(sink.emitIntent).toHaveBeenNthCalledWith(3, { type: "expand" });
  });

  it("Arrow keys emit swipe intents", () => {
    et.emit("keydown", { key: "ArrowLeft", target: null });
    et.emit("keydown", { key: "ArrowRight", target: null });
    expect(sink.emitIntent).toHaveBeenNthCalledWith(1, { type: "swipeLeft" });
    expect(sink.emitIntent).toHaveBeenNthCalledWith(2, { type: "swipeRight" });
  });

  it("ignores keydown originating from an editable element", () => {
    const inputEl = { tagName: "INPUT", isContentEditable: false };
    et.emit("keydown", { key: "Escape", target: inputEl });
    expect(sink.emitIntent).not.toHaveBeenCalled();
  });

  it("Shift+drag past threshold emits a swipe and suppresses the trailing click", () => {
    // Shift press begins engagement.
    et.emit("pointerdown", { button: 0, shiftKey: true, clientX: 400, clientY: 300, timeStamp: 0 });
    // Drag right: nx from (400-100)/1000=0.3 to (900-100)/1000=0.8 -> dx 0.5
    et.emit("pointermove", { clientX: 900, clientY: 300, timeStamp: 100 });
    expect(sink.emitIntent).toHaveBeenCalledWith({ type: "swipeRight" });

    sink.emitIntent.mockClear();
    et.emit("pointerup", { button: 0, timeStamp: 110 });
    // The click that ends the drag must NOT also expand.
    et.emit("click", { button: 0, shiftKey: true });
    expect(sink.emitIntent).not.toHaveBeenCalled();
  });

  it("stop() removes all listeners", () => {
    expect(et.count()).toBeGreaterThan(0);
    driver.stop();
    expect(et.count()).toBe(0);
    // Emitting after stop does nothing.
    et.emit("click", { button: 0, shiftKey: false });
    expect(sink.emitIntent).not.toHaveBeenCalled();
  });
});
