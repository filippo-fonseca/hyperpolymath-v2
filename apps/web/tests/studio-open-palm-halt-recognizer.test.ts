import { describe, expect, it, vi } from "vitest";

import {
  createOpenPalmHaltRecognizer,
  DEFAULT_OPEN_PALM_HALT,
} from "@/lib/studio/input/open-palm-halt-recognizer";

const HOLD = DEFAULT_OPEN_PALM_HALT.holdMs;
const FPS = 1000 / 30;

// Relaxed aiming size (the baseline) and a deliberate push past pushRatio×baseline.
const BASE = 0.2;
const PUSH = BASE * (DEFAULT_OPEN_PALM_HALT.pushRatio + 0.2); // comfortably armed

describe("createOpenPalmHaltRecognizer", () => {
  it("fires exactly once after a deliberate push held still for ~holdMs", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE }); // baseline
    for (t = FPS; t <= HOLD + 2 * FPS; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: a relaxed, still open palm (no push) never fires", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    // Hold a steady open palm at baseline size for well over the hold window —
    // this is the natural aiming pose and must NOT trip the kill-switch.
    for (let t = 0; t <= 3 * HOLD; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("latches: a long steady push still fires only once", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (t = FPS; t <= 3 * HOLD; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("CRITERION: transient open blips (< holdMs, interleaved closed) never fire", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    // Repeated short pushed bursts, each broken by a closed frame → clock resets.
    for (let burst = 0; burst < 5; burst++) {
      rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: BASE });
      for (let i = 0; i < 9; i++) {
        rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: PUSH });
      }
      rec.push({ t: (t += FPS), open: false, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("CRITERION: a partial palm (open=false) mid-dwell resets the clock", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (t = FPS; t < HOLD - 100; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    rec.push({ t: (t += FPS), open: false, nx: 0.5, ny: 0.5, size: PUSH }); // partial → reset
    for (let i = 0; i < 5; i++) {
      rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("CRITERION: dropping below the push threshold mid-dwell resets the clock", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (t = FPS; t < HOLD - 100; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    // Relax back toward baseline (still open, but no longer pushed) → clock clears.
    rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (let i = 0; i < 5; i++) {
      rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("CRITERION: movement during the dwell re-anchors and delays firing", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.3, ny: 0.5, size: BASE });
    // Drift beyond maxDriftNx every frame while pushed → clock keeps restarting.
    let nx = 0.3;
    for (t = FPS; t < 2 * HOLD; t += FPS) {
      nx += DEFAULT_OPEN_PALM_HALT.maxDriftNx + 0.01; // always exceeds drift gate
      if (nx > 0.9) nx = 0.3;
      rec.push({ t, open: true, nx, ny: 0.5, size: PUSH });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("small drift within the gate does NOT reset the dwell", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    let nx = 0.5;
    for (t = FPS; t <= HOLD + 2 * FPS; t += FPS) {
      nx += 0.001; // tiny wobble, well under maxDriftNx over the whole hold
      rec.push({ t, open: true, nx, ny: 0.5, size: PUSH });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("reopening after a close can fire again", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (t = FPS; t <= HOLD + 2 * FPS; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
    rec.push({ t: (t += FPS), open: false, nx: 0.5, ny: 0.5, size: PUSH }); // close → unlatch
    rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: BASE }); // new baseline
    const reopenStart = t;
    for (t = reopenStart + FPS; t <= reopenStart + HOLD + 2 * FPS; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).toHaveBeenCalledTimes(2);
  });

  it("reset() clears in-flight dwell", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (t = FPS; t < HOLD - 100; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    rec.reset();
    for (let i = 0; i < 5; i++) {
      rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("respects a custom holdMs", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt, { holdMs: 300 });
    let t = 0;
    rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: BASE });
    for (t = FPS; t <= 300 + 2 * FPS; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5, size: PUSH });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });
});
