import { describe, expect, it, vi } from "vitest";

import {
  createOpenPalmHaltRecognizer,
  DEFAULT_OPEN_PALM_HALT,
  type OpenPalmSample,
} from "./open-palm-halt-recognizer";

const HOLD = DEFAULT_OPEN_PALM_HALT.holdMs; // 1200
const DRIFT = DEFAULT_OPEN_PALM_HALT.maxDriftNx; // 0.06
const PUSH = DEFAULT_OPEN_PALM_HALT.pushRatio; // 1.28

const BASE_SIZE = 1;
/** A palm shoved clearly past the push gate. */
const PUSHED = BASE_SIZE * PUSH + 0.01;

const sample = (over: Partial<OpenPalmSample> = {}): OpenPalmSample => ({
  t: 0,
  open: true,
  nx: 0.5,
  ny: 0.5,
  size: BASE_SIZE,
  ...over,
});

describe("open-palm-halt recognizer (global kill-switch)", () => {
  it("never fires for a relaxed open palm, however long it is held", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    // The resting/aiming pose: open and still, but never shoved forward.
    for (let t = 0; t <= HOLD * 3; t += 100) r.push(sample({ t }));
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("fires once a pushed, still palm clears the dwell", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 })); // first open frame: baseline the relaxed size
    r.push(sample({ t: 100, size: PUSHED })); // push: anchors the dwell clock
    expect(onHalt).not.toHaveBeenCalled();
    r.push(sample({ t: 100 + HOLD, size: PUSHED })); // dwell complete
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("does not fire a frame early", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED }));
    r.push(sample({ t: 100 + HOLD - 1, size: PUSHED }));
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("latches after firing: one shove is one halt", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED }));
    r.push(sample({ t: 100 + HOLD, size: PUSHED })); // fires
    // Holding the shove must not machine-gun the kill-switch.
    for (let t = 100 + HOLD + 100; t <= 100 + HOLD * 3; t += 100) {
      r.push(sample({ t, size: PUSHED }));
    }
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("re-arms only after the palm closes (the latch clears on a non-open frame)", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED }));
    r.push(sample({ t: 100 + HOLD, size: PUSHED })); // halt 1
    r.push(sample({ t: 2000, open: false, size: PUSHED })); // palm closes: full reset
    r.push(sample({ t: 2100 })); // re-baseline the relaxed size
    r.push(sample({ t: 2200, size: PUSHED }));
    r.push(sample({ t: 2200 + HOLD, size: PUSHED })); // halt 2
    expect(onHalt).toHaveBeenCalledTimes(2);
  });

  it("re-anchors the dwell on drift past maxDriftNx, so a moving palm never fires", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, nx: 0.5, size: PUSHED })); // anchor at nx 0.5
    // Creep sideways past the drift gate every frame: each re-anchors the clock,
    // so the dwell never completes even though the palm stays pushed for ages.
    let nx = 0.5;
    for (let t = 200; t <= 100 + HOLD * 2; t += 100) {
      nx += DRIFT + 0.01;
      r.push(sample({ t, nx, size: PUSHED }));
    }
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("drift re-anchors rather than rejects: the dwell restarts from the new spot", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, nx: 0.5, size: PUSHED }));
    r.push(sample({ t: 200, nx: 0.5 + DRIFT + 0.01, size: PUSHED })); // re-anchors at t=200
    // The ORIGINAL dwell would have completed here; the re-anchored one has not.
    r.push(sample({ t: 100 + HOLD, nx: 0.5 + DRIFT + 0.01, size: PUSHED }));
    expect(onHalt).not.toHaveBeenCalled();
    // Held still from the new anchor, it fires on schedule.
    r.push(sample({ t: 200 + HOLD, nx: 0.5 + DRIFT + 0.01, size: PUSHED }));
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("tolerates sub-threshold jitter without restarting the dwell", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, nx: 0.5, ny: 0.5, size: PUSHED })); // anchor
    // Wobble inside the drift radius: the clock keeps running.
    r.push(sample({ t: 600, nx: 0.5 + DRIFT * 0.4, ny: 0.5, size: PUSHED }));
    r.push(sample({ t: 100 + HOLD, nx: 0.5, ny: 0.5 + DRIFT * 0.4, size: PUSHED }));
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("drops the dwell clock when the palm falls back below the push gate", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED })); // anchor
    r.push(sample({ t: 600, size: BASE_SIZE })); // relaxes back: clock cleared
    r.push(sample({ t: 700, size: PUSHED })); // pushes again: fresh anchor at t=700
    r.push(sample({ t: 100 + HOLD, size: PUSHED })); // old clock would fire here
    expect(onHalt).not.toHaveBeenCalled();
    r.push(sample({ t: 700 + HOLD, size: PUSHED }));
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("a single non-open frame fully resets an in-flight dwell", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED }));
    r.push(sample({ t: 600, open: false, size: PUSHED })); // flicker: restart from zero
    r.push(sample({ t: 700, size: PUSHED })); // re-baselines at the PUSHED size
    r.push(sample({ t: 100 + HOLD, size: PUSHED }));
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("re-baselines against the size at the reopen, so a shove is always relative", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    // The palm opens ALREADY near the camera: that large size is the new relaxed
    // baseline, so merely holding it there must not halt.
    r.push(sample({ t: 0, size: PUSHED }));
    for (let t = 100; t <= HOLD * 2; t += 100) r.push(sample({ t, size: PUSHED }));
    expect(onHalt).not.toHaveBeenCalled();
    // Only a shove past the NEW baseline arms it.
    r.push(sample({ t: HOLD * 2 + 100, size: PUSHED * PUSH + 0.01 }));
    r.push(sample({ t: HOLD * 3 + 200, size: PUSHED * PUSH + 0.01 }));
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("reset() clears the baseline and any in-flight dwell without firing", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt);
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED }));
    r.reset();
    r.push(sample({ t: 100 + HOLD, size: PUSHED })); // would have fired; re-baselines
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("honors a config override", () => {
    const onHalt = vi.fn();
    const r = createOpenPalmHaltRecognizer(onHalt, { holdMs: 300 });
    r.push(sample({ t: 0 }));
    r.push(sample({ t: 100, size: PUSHED }));
    r.push(sample({ t: 400, size: PUSHED }));
    expect(onHalt).toHaveBeenCalledTimes(1);
  });
});
