import { describe, expect, it, vi } from "vitest";

import {
  createPinchBloomRecognizer,
  DEFAULT_PINCH_BLOOM,
} from "./pinch-bloom-recognizer";

const HOLD = DEFAULT_PINCH_BLOOM.holdMs; // 350
const WIN = DEFAULT_PINCH_BLOOM.bloomWindowMs; // 150

describe("pinch-bloom recognizer (quick-pinch tap)", () => {
  it("fires a tap on a quick pinch released into an open hand", () => {
    const onTap = vi.fn();
    const r = createPinchBloomRecognizer(onTap);
    r.push({ t: 0, engaged: true, openPose: false });
    r.push({ t: 100, engaged: true, openPose: false }); // held < holdMs
    r.push({ t: 150, engaged: false, openPose: true }); // quick release, open
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when the pinch is held past holdMs (that is a grab)", () => {
    const onTap = vi.fn();
    const r = createPinchBloomRecognizer(onTap);
    r.push({ t: 0, engaged: true, openPose: false });
    r.push({ t: HOLD + 50, engaged: true, openPose: false }); // held past T ⇒ grab
    r.push({ t: HOLD + 100, engaged: false, openPose: true }); // release too late
    expect(onTap).not.toHaveBeenCalled();
  });

  it("waits for the open pose within bloomWindowMs after a quick release", () => {
    const onTap = vi.fn();
    const r = createPinchBloomRecognizer(onTap);
    r.push({ t: 0, engaged: true, openPose: false });
    r.push({ t: 100, engaged: false, openPose: false }); // released, pose lags
    expect(onTap).not.toHaveBeenCalled();
    r.push({ t: 100 + WIN - 10, engaged: false, openPose: true }); // pose catches up
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("gives up once a non-open frame lapses the window", () => {
    const onTap = vi.fn();
    const r = createPinchBloomRecognizer(onTap);
    r.push({ t: 0, engaged: true, openPose: false });
    r.push({ t: 100, engaged: false, openPose: false }); // release into a fist
    r.push({ t: 100 + WIN + 10, engaged: false, openPose: false }); // window lapses
    r.push({ t: 100 + WIN + 40, engaged: false, openPose: true }); // too late now
    expect(onTap).not.toHaveBeenCalled();
  });

  it("fires at most once per pinch", () => {
    const onTap = vi.fn();
    const r = createPinchBloomRecognizer(onTap);
    r.push({ t: 0, engaged: true, openPose: false });
    r.push({ t: 100, engaged: false, openPose: true });
    r.push({ t: 110, engaged: false, openPose: true });
    r.push({ t: 120, engaged: false, openPose: true });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("reset() clears a pending watch without firing", () => {
    const onTap = vi.fn();
    const r = createPinchBloomRecognizer(onTap);
    r.push({ t: 0, engaged: true, openPose: false });
    r.push({ t: 100, engaged: false, openPose: false }); // pending watch
    r.reset();
    r.push({ t: 120, engaged: false, openPose: true }); // would have fired
    expect(onTap).not.toHaveBeenCalled();
  });
});
