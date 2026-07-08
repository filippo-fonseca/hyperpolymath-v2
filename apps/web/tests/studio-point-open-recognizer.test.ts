import { describe, expect, it, vi } from "vitest";

import {
  createPointOpenRecognizer,
  DEFAULT_POINT_OPEN,
} from "@/lib/studio/input/point-open-recognizer";

const DWELL = DEFAULT_POINT_OPEN.dwellMs;
const JAB = DEFAULT_POINT_OPEN.jabDelta;
const FPS = 1000 / 30;

describe("createPointOpenRecognizer", () => {
  it("fires once after a still point held for ~dwellMs (hold path)", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    for (let t = 0; t <= DWELL + FPS; t += FPS) {
      rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires immediately on a forward tap, before the dwell (tap path)", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    let t = 0;
    rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 }); // baseline
    rec.push({ t: (t += FPS), pointing: true, nx: 0.5, ny: 0.5, forward: JAB + 0.01 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(t).toBeLessThan(DWELL);
  });

  it("latches: a long steady point still fires only once", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    for (let t = 0; t <= 3 * DWELL; t += FPS) {
      rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("CRITERION: a non-pointing frame mid-dwell resets the clock", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    let t = 0;
    for (; t < DWELL - 100; t += FPS) {
      rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    rec.push({ t: (t += FPS), pointing: false, nx: 0.5, ny: 0.5, forward: 0 }); // break
    for (let i = 0; i < 5; i++) {
      rec.push({ t: (t += FPS), pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("CRITERION: drifting the reticle past the gate never matures the dwell", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    let nx = 0.3;
    for (let t = 0; t < 2 * DWELL; t += FPS) {
      nx += DEFAULT_POINT_OPEN.maxDriftNx + 0.01; // always exceeds the drift gate
      if (nx > 0.9) nx = 0.3;
      rec.push({ t, pointing: true, nx, ny: 0.5, forward: 0 });
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("small reticle wobble within the gate does NOT reset the dwell", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    let nx = 0.5;
    for (let t = 0; t <= DWELL + FPS; t += FPS) {
      nx += 0.001; // tiny wobble under maxDriftNx across the whole hold
      rec.push({ t, pointing: true, nx, ny: 0.5, forward: 0 });
    }
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a slow forward creep below jabDelta does not tap-fire", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    // Forward inches up by less than jabDelta total, spread across a few frames,
    // all well under the dwell — neither path should fire.
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      rec.push({
        t: i * FPS,
        pointing: true,
        nx: 0.5,
        ny: 0.5,
        forward: (JAB * 0.5 * i) / steps,
      });
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("re-pointing after the point ends can fire again", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    let t = 0;
    for (; t <= DWELL + FPS; t += FPS) {
      rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    expect(onOpen).toHaveBeenCalledTimes(1);
    rec.push({ t: (t += FPS), pointing: false, nx: 0.5, ny: 0.5, forward: 0 }); // unlatch
    const restart = t;
    for (t = restart + FPS; t <= restart + DWELL + 3 * FPS; t += FPS) {
      rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("reset() clears in-flight dwell", () => {
    const onOpen = vi.fn();
    const rec = createPointOpenRecognizer(onOpen);
    let t = 0;
    for (; t < DWELL - 100; t += FPS) {
      rec.push({ t, pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    rec.reset();
    for (let i = 0; i < 5; i++) {
      rec.push({ t: (t += FPS), pointing: true, nx: 0.5, ny: 0.5, forward: 0 });
    }
    expect(onOpen).not.toHaveBeenCalled();
  });
});
