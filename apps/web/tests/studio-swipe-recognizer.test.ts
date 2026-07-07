import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SWIPE,
  createSwipeRecognizer,
} from "@/lib/studio/input/swipe-recognizer";

describe("createSwipeRecognizer", () => {
  it("fires swipeRight for a fast rightward engaged drag", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.3, ny: 0.5, engaged: true }); // origin
    rec.push({ t: 100, nx: 0.6, ny: 0.5, engaged: true }); // dx = +0.3
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("swipeRight");
  });

  it("fires swipeLeft for a leftward drag", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.6, ny: 0.5, engaged: true });
    rec.push({ t: 100, nx: 0.3, ny: 0.5, engaged: true }); // dx = -0.3
    expect(onSwipe).toHaveBeenCalledWith("swipeLeft");
  });

  it("fires only once until disengaged", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    rec.push({ t: 80, nx: 0.6, ny: 0.5, engaged: true });
    rec.push({ t: 120, nx: 0.9, ny: 0.5, engaged: true });
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it("re-engagement after disengage allows a new swipe", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    rec.push({ t: 80, nx: 0.6, ny: 0.5, engaged: true }); // fire 1
    rec.push({ t: 90, nx: 0.6, ny: 0.5, engaged: false }); // disengage
    rec.push({ t: 100, nx: 0.6, ny: 0.5, engaged: true }); // new origin
    rec.push({ t: 160, nx: 0.2, ny: 0.5, engaged: true }); // fire 2
    expect(onSwipe).toHaveBeenCalledTimes(2);
    expect(onSwipe).toHaveBeenNthCalledWith(1, "swipeRight");
    expect(onSwipe).toHaveBeenNthCalledWith(2, "swipeLeft");
  });

  it("does not fire when displacement is below minDx", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.3, ny: 0.5, engaged: true });
    rec.push({ t: 100, nx: 0.3 + DEFAULT_SWIPE.minDx - 0.01, ny: 0.5, engaged: true });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("does not fire when the gesture is too vertical", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.3, ny: 0.2, engaged: true });
    // dx = 0.3 but dy = 0.3 -> ratio 1.0 > maxDyRatio 0.6 -> rejected
    rec.push({ t: 100, nx: 0.6, ny: 0.5, engaged: true });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("re-anchors origin when the window expires without a swipe", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.3, ny: 0.5, engaged: true }); // origin
    rec.push({ t: 500, nx: 0.35, ny: 0.5, engaged: true }); // > maxMs, re-anchor here
    rec.push({ t: 550, nx: 0.7, ny: 0.5, engaged: true }); // dx from re-anchor = 0.35
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("swipeRight");
  });

  it("reset() clears in-flight state", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe);
    rec.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    rec.reset();
    rec.push({ t: 60, nx: 0.6, ny: 0.5, engaged: true }); // treated as fresh origin
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("respects a custom config", () => {
    const onSwipe = vi.fn();
    const rec = createSwipeRecognizer(onSwipe, { minDx: 0.05 });
    rec.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    rec.push({ t: 50, nx: 0.56, ny: 0.5, engaged: true }); // dx = 0.06 >= 0.05
    expect(onSwipe).toHaveBeenCalledWith("swipeRight");
  });
});
