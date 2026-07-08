import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HandTrackingDriver,
  type HandDriverStatus,
} from "@/lib/studio/input/drivers/hand";
import type { HandLandmarkerLike } from "@/lib/studio/input/hand/landmarker";
import type { WebcamHandle } from "@/lib/studio/input/hand/webcam";
import type { Pt } from "@/lib/studio/input/hand/gesture-core";
import type { StudioDriverEnv, StudioInputSink } from "@/lib/studio/input/types";

/** Reuses the mouse-driver sink pattern: spy on every contract method. */
function makeSink(): StudioInputSink & {
  moveCursor: ReturnType<typeof vi.fn>;
  setCursorActive: ReturnType<typeof vi.fn>;
  emitIntent: ReturnType<typeof vi.fn>;
  emitPhase: ReturnType<typeof vi.fn>;
} {
  return {
    moveCursor: vi.fn(),
    setCursorActive: vi.fn(),
    emitIntent: vi.fn(),
    emitPhase: vi.fn(),
  };
}

const ENV: StudioDriverEnv = {
  getStageRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
  eventTarget: { addEventListener() {}, removeEventListener() {} },
};

/** An extended, index-tip-at-cx open hand so the interpreter emits a cursor. */
function openHand(cx = 0.5): Pt[] {
  const s = 0.2;
  const lm: Pt[] = Array.from({ length: 21 }, () => ({ x: cx, y: 0.5, z: 0 }));
  lm[0] = { x: cx, y: 0.5 + s, z: 0 };
  lm[9] = { x: cx, y: 0.5, z: 0 };
  for (const tip of [8, 12, 16, 20]) lm[tip] = { x: cx, y: 0.5 + s - 2 * s, z: 0 };
  return lm;
}

/** A controllable fake webcam: `advance()` bumps currentTime to force detection. */
function makeFakeWebcam() {
  const video = { currentTime: 0 } as unknown as HTMLVideoElement;
  const stop = vi.fn();
  const handle: WebcamHandle = { video, stop };
  return { handle, stop, advance: () => (video.currentTime += 1) };
}

/** A fake landmarker returning scripted landmarks per call. */
function makeFakeLandmarker(script: (Pt[] | null)[]) {
  let i = 0;
  const detectForVideo = vi.fn(() => {
    const lm = script[Math.min(i, script.length - 1)] ?? null;
    i += 1;
    return { landmarks: lm ? [lm] : [] };
  });
  const close = vi.fn();
  const landmarker: HandLandmarkerLike = { detectForVideo, close };
  return { landmarker, detectForVideo, close };
}

/** Deterministic rAF stand-in that drains scheduled callbacks on `tick()`. */
function makeScheduler() {
  let queue: Array<() => void> = [];
  let nextId = 1;
  const scheduleFrame = vi.fn((cb: () => void) => {
    queue.push(cb);
    return nextId++;
  });
  const cancelFrame = vi.fn();
  const tick = () => {
    const batch = queue;
    queue = [];
    for (const cb of batch) cb();
  };
  return { scheduleFrame, cancelFrame, tick };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("HandTrackingDriver", () => {
  let sink: ReturnType<typeof makeSink>;
  beforeEach(() => {
    sink = makeSink();
  });

  it("walks idle → loading-model → awaiting-permission → running", async () => {
    const statuses: HandDriverStatus[] = [];
    const { landmarker } = makeFakeLandmarker([openHand()]);
    const { handle } = makeFakeWebcam();
    const sched = makeScheduler();

    const driver = new HandTrackingDriver({
      onStatusChange: (s) => statuses.push(s),
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () => Promise.resolve(handle),
      now: () => 0,
      scheduleFrame: sched.scheduleFrame,
      cancelFrame: sched.cancelFrame,
    });

    expect(driver.getStatus()).toEqual({ state: "idle" });
    driver.start(sink, ENV);
    expect(driver.getStatus()).toEqual({ state: "loading-model" });

    await flush();
    expect(driver.getStatus()).toEqual({ state: "running", handVisible: false });
    expect(statuses.map((s) => s.state)).toEqual([
      "loading-model",
      "awaiting-permission",
      "running",
    ]);
  });

  it("routes detected landmarks to the sink and reports handVisible", async () => {
    const { landmarker, detectForVideo } = makeFakeLandmarker([openHand(0.5)]);
    const fake = makeFakeWebcam();
    const sched = makeScheduler();
    const statuses: HandDriverStatus[] = [];

    const driver = new HandTrackingDriver({
      onStatusChange: (s) => statuses.push(s),
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () => Promise.resolve(fake.handle),
      now: () => 0,
      scheduleFrame: sched.scheduleFrame,
      cancelFrame: sched.cancelFrame,
    });

    driver.start(sink, ENV);
    await flush();

    fake.advance(); // fresh frame
    sched.tick();

    expect(detectForVideo).toHaveBeenCalledTimes(1);
    expect(sink.setCursorActive).toHaveBeenCalledWith(true);
    expect(sink.moveCursor).toHaveBeenCalled();
    const [nx] = sink.moveCursor.mock.calls.at(-1)!;
    expect(nx).toBeCloseTo(0.5, 3);
    expect(driver.getStatus()).toEqual({ state: "running", handVisible: true });
  });

  it("does not re-detect when the video frame has not advanced", async () => {
    const { landmarker, detectForVideo } = makeFakeLandmarker([openHand()]);
    const fake = makeFakeWebcam();
    const sched = makeScheduler();
    const driver = new HandTrackingDriver({
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () => Promise.resolve(fake.handle),
      now: () => 0,
      scheduleFrame: sched.scheduleFrame,
      cancelFrame: sched.cancelFrame,
    });
    driver.start(sink, ENV);
    await flush();

    fake.advance();
    sched.tick(); // detects once
    sched.tick(); // currentTime unchanged → no new detection
    expect(detectForVideo).toHaveBeenCalledTimes(1);
  });

  it("maps a NotAllowedError to error/permission-denied", async () => {
    const { landmarker } = makeFakeLandmarker([]);
    const driver = new HandTrackingDriver({
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () =>
        Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
    });
    driver.start(sink, ENV);
    await flush();
    expect(driver.getStatus()).toEqual({ state: "error", reason: "permission-denied" });
  });

  it("maps a NotFoundError to error/no-camera", async () => {
    const { landmarker } = makeFakeLandmarker([]);
    const driver = new HandTrackingDriver({
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () =>
        Promise.reject(Object.assign(new Error("none"), { name: "NotFoundError" })),
    });
    driver.start(sink, ENV);
    await flush();
    expect(driver.getStatus()).toEqual({ state: "error", reason: "no-camera" });
  });

  it("maps a loader rejection to error/model-load-failed", async () => {
    const driver = new HandTrackingDriver({
      loadLandmarker: () => Promise.reject(new Error("wasm boom")),
      acquireWebcam: () => Promise.resolve(makeFakeWebcam().handle),
    });
    driver.start(sink, ENV);
    await flush();
    expect(driver.getStatus()).toEqual({ state: "error", reason: "model-load-failed" });
  });

  it("stop() mid-init stops the raced stream and emits no status after idle", async () => {
    const { landmarker } = makeFakeLandmarker([openHand()]);
    const fake = makeFakeWebcam();
    let resolveWebcam!: (h: WebcamHandle) => void;
    const webcamPromise = new Promise<WebcamHandle>((r) => {
      resolveWebcam = r;
    });
    const statuses: HandDriverStatus[] = [];

    const driver = new HandTrackingDriver({
      onStatusChange: (s) => statuses.push(s),
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () => webcamPromise,
    });

    driver.start(sink, ENV);
    await flush(); // reaches awaiting-permission, webcam still pending
    expect(driver.getStatus()).toEqual({ state: "awaiting-permission" });

    driver.stop();
    expect(driver.getStatus()).toEqual({ state: "idle" });

    resolveWebcam(fake.handle);
    await flush();

    expect(fake.stop).toHaveBeenCalledTimes(1); // raced stream cleaned up
    expect(driver.getStatus()).toEqual({ state: "idle" }); // no status after idle
    expect(statuses.at(-1)).toEqual({ state: "idle" });
  });

  it("stop() cancels the frame loop and closes the landmarker", async () => {
    const { landmarker, close } = makeFakeLandmarker([openHand()]);
    const fake = makeFakeWebcam();
    const sched = makeScheduler();
    const driver = new HandTrackingDriver({
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () => Promise.resolve(fake.handle),
      now: () => 0,
      scheduleFrame: sched.scheduleFrame,
      cancelFrame: sched.cancelFrame,
    });
    driver.start(sink, ENV);
    await flush();

    driver.stop();
    expect(sched.cancelFrame).toHaveBeenCalled();
    expect(fake.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(driver.getStatus()).toEqual({ state: "idle" });
  });

  it("does not reschedule the loop when an intent stops the driver mid-frame", async () => {
    // A still open palm firing `halt` is the real reentrancy: its intent
    // subscriber calls stop() synchronously, from inside `interpreter.push`,
    // while `loop` is still on the stack. The loop must not resurrect itself.
    const { landmarker, close } = makeFakeLandmarker([openHand(), openHand()]);
    const fake = makeFakeWebcam();
    const sched = makeScheduler();

    const driver = new HandTrackingDriver({
      // holdMs 0 + generous drift ⇒ halt fires on the second still-open frame.
      gesture: { haltHoldMs: 0, haltMaxDriftNx: 1 },
      loadLandmarker: () => Promise.resolve(landmarker),
      acquireWebcam: () => Promise.resolve(fake.handle),
      now: () => 0,
      scheduleFrame: sched.scheduleFrame,
      cancelFrame: sched.cancelFrame,
    });

    // The halt consumer: stop the driver synchronously when any intent fires.
    sink.emitIntent.mockImplementation(() => driver.stop());

    driver.start(sink, ENV);
    await flush();

    fake.advance();
    sched.tick(); // frame 1: anchors the halt dwell, reschedules normally

    expect(sink.emitIntent).not.toHaveBeenCalled();
    const scheduledBefore = sched.scheduleFrame.mock.calls.length;

    fake.advance();
    sched.tick(); // frame 2: halt fires → stop() mid-push → must NOT reschedule

    expect(sink.emitIntent).toHaveBeenCalledWith({ type: "halt" });
    // No frame scheduled after the mid-frame stop — the dead loop stays dead.
    expect(sched.scheduleFrame.mock.calls.length).toBe(scheduledBefore);
    expect(fake.stop).toHaveBeenCalledTimes(1); // stream released exactly once
    expect(close).toHaveBeenCalledTimes(1);
    expect(driver.getStatus()).toEqual({ state: "idle" });
  });

  it("errors with insecure-context on the default path in a non-secure environment", () => {
    const original = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    try {
      const driver = new HandTrackingDriver(); // no injected webcam → env guard runs
      driver.start(sink, ENV);
      expect(driver.getStatus()).toEqual({ state: "error", reason: "insecure-context" });
    } finally {
      if (original) Object.defineProperty(window, "isSecureContext", original);
    }
  });
});
