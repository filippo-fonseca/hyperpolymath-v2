import { describe, expect, it, vi } from "vitest";

import {
  createOpenPalmHaltRecognizer,
  DEFAULT_OPEN_PALM_HALT,
} from "@/lib/studio/input/open-palm-halt-recognizer";

const HOLD = DEFAULT_OPEN_PALM_HALT.holdMs;
const FPS = 1000 / 30;

describe("createOpenPalmHaltRecognizer", () => {
  it("fires exactly once after a steady, still, ~1s open palm", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    for (let t = 0; t <= HOLD + FPS; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("latches: a long steady hold still fires only once", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    for (let t = 0; t <= 3 * HOLD; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("CRITERION: transient open blips (< 1s, interleaved closed) never fire", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    // Repeated 300ms open bursts, each broken by a closed frame → clock resets.
    for (let burst = 0; burst < 5; burst++) {
      for (let i = 0; i < 9; i++) rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5 });
      rec.push({ t: (t += FPS), open: false, nx: 0.5, ny: 0.5 });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("CRITERION: a partial palm (open=false) mid-dwell resets the clock", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    for (; t < HOLD - 100; t += FPS) rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    rec.push({ t: (t += FPS), open: false, nx: 0.5, ny: 0.5 }); // partial → reset
    for (let i = 0; i < 5; i++) rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5 });
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("CRITERION: movement during the dwell re-anchors and delays firing", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    // Drift beyond maxDriftNx every few frames → clock keeps restarting.
    let nx = 0.3;
    for (; t < 2 * HOLD; t += FPS) {
      nx += DEFAULT_OPEN_PALM_HALT.maxDriftNx + 0.01; // always exceeds drift gate
      if (nx > 0.9) nx = 0.3;
      rec.push({ t, open: true, nx, ny: 0.5 });
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("small drift within the gate does NOT reset the dwell", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    let nx = 0.5;
    for (; t <= HOLD + FPS; t += FPS) {
      nx += 0.001; // tiny wobble, well under maxDriftNx over the whole hold
      rec.push({ t, open: true, nx, ny: 0.5 });
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("reopening after a close can fire again", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    for (; t <= HOLD + FPS; t += FPS) rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    expect(onHalt).toHaveBeenCalledTimes(1);
    rec.push({ t: (t += FPS), open: false, nx: 0.5, ny: 0.5 }); // close → unlatch
    const reopenStart = t;
    for (; t <= reopenStart + HOLD + FPS; t += FPS) {
      rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    }
    expect(onHalt).toHaveBeenCalledTimes(2);
  });

  it("reset() clears in-flight dwell", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt);
    let t = 0;
    for (; t < HOLD - 100; t += FPS) rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    rec.reset();
    for (let i = 0; i < 5; i++) rec.push({ t: (t += FPS), open: true, nx: 0.5, ny: 0.5 });
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("respects a custom holdMs", () => {
    const onHalt = vi.fn();
    const rec = createOpenPalmHaltRecognizer(onHalt, { holdMs: 300 });
    for (let t = 0; t <= 300 + FPS; t += FPS) rec.push({ t, open: true, nx: 0.5, ny: 0.5 });
    expect(onHalt).toHaveBeenCalledTimes(1);
  });
});
