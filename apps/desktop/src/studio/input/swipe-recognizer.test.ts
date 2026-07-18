import { describe, expect, it, vi } from "vitest";

import { createSwipeRecognizer, DEFAULT_SWIPE } from "./swipe-recognizer";

const MIN_DX = DEFAULT_SWIPE.minDx; // 0.18
const MAX_MS = DEFAULT_SWIPE.maxMs; // 450
const DY_RATIO = DEFAULT_SWIPE.maxDyRatio; // 0.6

describe("swipe recognizer (global navigation)", () => {
  it("fires swipeRight on rightward travel past minDx within the window", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true }); // rising edge: anchor
    r.push({ t: 100, nx: 0.5 + MIN_DX + 0.01, ny: 0.5, engaged: true });
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith("swipeRight");
  });

  it("fires swipeLeft on leftward travel", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    r.push({ t: 100, nx: 0.5 - MIN_DX - 0.01, ny: 0.5, engaged: true });
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith("swipeLeft");
  });

  it("does not fire below minDx (a nudge is not a swipe)", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    r.push({ t: 100, nx: 0.5 + MIN_DX - 0.01, ny: 0.5, engaged: true });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("rejects a swipe that is too vertical (maxDyRatio)", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    const dx = MIN_DX + 0.02;
    r.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    // |dy| just past |dx| * maxDyRatio ⇒ diagonal, not a swipe.
    r.push({ t: 100, nx: 0.5 + dx, ny: 0.5 + dx * DY_RATIO + 0.01, engaged: true });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("accepts a swipe just inside the verticality limit", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    const dx = MIN_DX + 0.02;
    r.push({ t: 0, nx: 0.5, ny: 0.5, engaged: true });
    r.push({ t: 100, nx: 0.5 + dx, ny: 0.5 + dx * DY_RATIO - 0.01, engaged: true });
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith("swipeRight");
  });

  it("re-anchors when maxMs expires, so a slow drag never fires from a stale origin", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    // Crawl past minDx, but too slowly: the window has already expired, so this
    // sample re-anchors instead of firing.
    r.push({ t: MAX_MS + 1, nx: 0.2 + MIN_DX + 0.1, ny: 0.5, engaged: true });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("fires from the re-anchored origin when a slow drag turns fast", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    const reanchorNx = 0.3;
    r.push({ t: MAX_MS + 1, nx: reanchorNx, ny: 0.5, engaged: true }); // re-anchor here
    // A fast flick measured from the NEW origin now qualifies.
    r.push({ t: MAX_MS + 101, nx: reanchorNx + MIN_DX + 0.01, ny: 0.5, engaged: true });
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith("swipeRight");
  });

  it("fires at most once per engagement (latched until disengage)", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    r.push({ t: 100, nx: 0.2 + MIN_DX + 0.01, ny: 0.5, engaged: true }); // fires
    r.push({ t: 150, nx: 0.2 + MIN_DX + 0.2, ny: 0.5, engaged: true }); // keeps travelling
    r.push({ t: 200, nx: 0.2 + MIN_DX + 0.4, ny: 0.5, engaged: true });
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it("disengaging resets, so the next engagement can swipe again", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    r.push({ t: 100, nx: 0.2 + MIN_DX + 0.01, ny: 0.5, engaged: true }); // swipe 1
    r.push({ t: 200, nx: 0.9, ny: 0.5, engaged: false }); // release
    r.push({ t: 300, nx: 0.2, ny: 0.5, engaged: true }); // fresh anchor
    r.push({ t: 400, nx: 0.2 + MIN_DX + 0.01, ny: 0.5, engaged: true }); // swipe 2
    expect(onSwipe).toHaveBeenCalledTimes(2);
  });

  it("never fires from a disengaged jump (the origin only anchors while engaged)", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.2, ny: 0.5, engaged: false });
    r.push({ t: 100, nx: 0.9, ny: 0.5, engaged: false });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("reset() drops the origin so travel across it never fires", () => {
    const onSwipe = vi.fn();
    const r = createSwipeRecognizer(onSwipe);
    r.push({ t: 0, nx: 0.2, ny: 0.5, engaged: true });
    r.reset();
    // Would have cleared minDx from the pre-reset origin; re-anchors instead.
    r.push({ t: 100, nx: 0.2 + MIN_DX + 0.01, ny: 0.5, engaged: true });
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
