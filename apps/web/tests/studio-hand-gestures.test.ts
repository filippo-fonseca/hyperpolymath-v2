import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyFinger,
  computeCursorTarget,
  computeFingerRatios,
  computePalmCentroid,
  computePalmCentroidNormalized,
  computePinchRatio,
  createHandGestureInterpreter,
  DEFAULT_HAND_GESTURE,
  poseFromExtendedCount,
  type Pt,
} from "@/lib/studio/input/hand/gesture-core";
import type { StudioIntentInput, StudioPhaseInput } from "@/lib/studio/input/types";

// ---- Synthetic hand builders ------------------------------------------------

const fill21 = (base: Pt): Pt[] => Array.from({ length: 21 }, () => ({ ...base }));

/**
 * Builds a plausible 21-point hand. `tipRatio` is the tip/palm extension ratio
 * applied to all four fingers (>1.6 → open, <1.35 → fist). Palm scale is fixed
 * so ratios are exact. Palm anchors spread around `cx` so the centroid tracks
 * `cx`. Only the landmarks the math reads carry realistic values.
 */
function makeHand({
  cx = 0.5,
  cy = 0.5,
  scale = 0.2,
  tipRatio,
}: {
  cx?: number;
  cy?: number;
  scale?: number;
  tipRatio: number;
}): Pt[] {
  const s = scale;
  const lm = fill21({ x: cx, y: cy, z: 0 });
  lm[0] = { x: cx, y: cy + s, z: 0 }; // wrist (below palm)
  lm[9] = { x: cx, y: cy, z: 0 }; // middle MCP → palm scale = s
  lm[5] = { x: cx - 0.4 * s, y: cy + 0.05 * s, z: 0 }; // index MCP
  lm[13] = { x: cx + 0.3 * s, y: cy + 0.05 * s, z: 0 }; // ring MCP
  lm[17] = { x: cx + 0.5 * s, y: cy + 0.1 * s, z: 0 }; // pinky MCP
  const tipY = cy + s - tipRatio * s; // dist(wrist, tip) = tipRatio * s
  for (const tip of [8, 12, 16, 20]) lm[tip] = { x: cx, y: tipY, z: 0 };
  // Thumb tip held clear of the index tip so the pinch ratio stays open (> off).
  lm[4] = { x: cx + 0.6 * s, y: cy, z: 0 };
  return lm;
}

const makeOpenHand = (o: { cx?: number; cy?: number; scale?: number } = {}) =>
  makeHand({ ...o, tipRatio: 2.0 });
const makeFist = (o: { cx?: number; cy?: number; scale?: number } = {}) =>
  makeHand({ ...o, tipRatio: 1.1 });

/**
 * A pinch: fingers extended (open pose) but the thumb tip laid onto the index
 * tip, so the pinch ratio collapses toward zero (well under `pinchOnRatio`).
 */
const makePinchHand = (o: { cx?: number; cy?: number; scale?: number } = {}): Pt[] => {
  const lm = makeHand({ ...o, tipRatio: 2.0 });
  lm[4] = { ...lm[8]! }; // thumb tip onto index tip → ratio ≈ 0
  return lm;
};

const handWithIndexTip = (x: number, y: number): Pt[] => {
  const lm = fill21({ x: 0.5, y: 0.5, z: 0 });
  lm[8] = { x, y, z: 0 };
  return lm;
};

function makeCallbacks() {
  return {
    onCursorMove: vi.fn<(nx: number, ny: number) => void>(),
    onCursorActive: vi.fn<(active: boolean) => void>(),
    onIntent: vi.fn<(intent: StudioIntentInput) => void>(),
    onPhase: vi.fn<(phase: StudioPhaseInput) => void>(),
  };
}

const phaseTypes = (cb: ReturnType<typeof makeCallbacks>): string[] =>
  cb.onPhase.mock.calls.map(([p]) => p.type);

const FPS = 1000 / 30;

// ---- Pure pose math ---------------------------------------------------------

describe("pose math", () => {
  it("open hand → all four fingers extended (ratio ≈ 2)", () => {
    const ratios = computeFingerRatios(makeOpenHand());
    for (const r of ratios) expect(r).toBeCloseTo(2.0, 6);
    expect(poseFromExtendedCount(4, DEFAULT_HAND_GESTURE)).toBe("open");
  });

  it("fist → all fingers curled (ratio ≈ 1.1), count → fist", () => {
    const ratios = computeFingerRatios(makeFist());
    for (const r of ratios) expect(r).toBeLessThan(DEFAULT_HAND_GESTURE.curlThreshold);
    expect(poseFromExtendedCount(0, DEFAULT_HAND_GESTURE)).toBe("fist");
  });

  it("ambiguous count (2) keeps the prior pose (returns null)", () => {
    expect(poseFromExtendedCount(2, DEFAULT_HAND_GESTURE)).toBeNull();
  });

  it("hysteresis: a ratio inside the band keeps the prior finger state", () => {
    expect(classifyFinger(1.5, true, DEFAULT_HAND_GESTURE)).toBe(true);
    expect(classifyFinger(1.5, false, DEFAULT_HAND_GESTURE)).toBe(false);
    // Outside the band it flips regardless of prior state.
    expect(classifyFinger(1.7, false, DEFAULT_HAND_GESTURE)).toBe(true);
    expect(classifyFinger(1.2, true, DEFAULT_HAND_GESTURE)).toBe(false);
  });

  it("mirrors x: a hand at image x=0.2 maps to cursor nx > 0.5", () => {
    const { nx } = computeCursorTarget(handWithIndexTip(0.2, 0.5), DEFAULT_HAND_GESTURE);
    expect(nx).toBeGreaterThan(0.5);
  });

  it("interaction box: rawX below the inset clamps to 0", () => {
    // index tip x=0.9 → mirrored rawX = 0.1 < inset(0.15) → clamp to 0.
    const { nx } = computeCursorTarget(handWithIndexTip(0.9, 0.5), DEFAULT_HAND_GESTURE);
    expect(nx).toBe(0);
  });

  it("pinch ratio: thumb-on-index ≈ 0; thumb held clear stays open", () => {
    expect(computePinchRatio(makePinchHand())).toBeLessThan(DEFAULT_HAND_GESTURE.pinchOnRatio);
    expect(computePinchRatio(makeOpenHand())).toBeGreaterThan(DEFAULT_HAND_GESTURE.pinchOffRatio);
    expect(computePinchRatio(makeFist())).toBeGreaterThan(DEFAULT_HAND_GESTURE.pinchOffRatio);
  });

  it("pinch ratio is Infinity for a degenerate (zero-size) palm", () => {
    expect(computePinchRatio(fill21({ x: 0.5, y: 0.5, z: 0 }))).toBe(Infinity);
  });

  it("palm centroid is the mean of the five palm anchors", () => {
    const lm = fill21({ x: 0, y: 0, z: 0 });
    lm[0] = { x: 0.5, y: 0.6, z: 0 };
    lm[5] = { x: 0.4, y: 0.5, z: 0 };
    lm[9] = { x: 0.5, y: 0.5, z: 0 };
    lm[13] = { x: 0.6, y: 0.5, z: 0 };
    lm[17] = { x: 0.5, y: 0.4, z: 0 };
    const c = computePalmCentroid(lm);
    expect(c.x).toBeCloseTo(0.5, 6);
    expect(c.y).toBeCloseTo(0.5, 6);
    // Normalized: x mirrored (1-0.5=0.5) then remapped; symmetric point stays > 0.
    const n = computePalmCentroidNormalized(lm, DEFAULT_HAND_GESTURE);
    expect(n.nx).toBeCloseTo((0.5 - 0.15) / 0.7, 6);
  });
});

// ---- Interpreter (frame-sequence driven) ------------------------------------

describe("hand gesture interpreter", () => {
  let cb: ReturnType<typeof makeCallbacks>;
  beforeEach(() => {
    cb = makeCallbacks();
  });

  it("1) hand appears → cursor active + moves toward the hand", () => {
    const interp = createHandGestureInterpreter(cb);
    interp.push(0, makeOpenHand({ cx: 0.5 }));
    expect(cb.onCursorActive).toHaveBeenCalledWith(true);
    const [nx] = cb.onCursorMove.mock.calls.at(-1)!;
    expect(nx).toBeCloseTo(0.5, 3); // x=0.5 → mirror 0.5 → remap 0.5
  });

  it("2) hand lost past grace → inactive; reappears → active, no intent", () => {
    const interp = createHandGestureInterpreter(cb);
    interp.push(0, makeOpenHand());
    interp.push(100, null); // nullSince = 100
    interp.push(400, null); // 300ms ≥ 250 grace → inactive
    expect(cb.onCursorActive).toHaveBeenCalledWith(false);
    cb.onCursorActive.mockClear();
    interp.push(500, makeOpenHand());
    expect(cb.onCursorActive).toHaveBeenCalledWith(true);
    expect(cb.onIntent).not.toHaveBeenCalled();
  });

  it("3) only 2 fist frames then open → never engages, no intent", () => {
    const interp = createHandGestureInterpreter(cb);
    interp.push(0, makeOpenHand());
    interp.push(FPS, makeFist());
    interp.push(2 * FPS, makeFist());
    interp.push(3 * FPS, makeOpenHand());
    expect(cb.onIntent).not.toHaveBeenCalled();
  });

  it("4) quick stationary fist pulse → exactly one expand, no collapse/swipe", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand()); // establish open
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeFist()); // commit fist (~<200ms)
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeOpenHand()); // commit open → expand
    const intents = cb.onIntent.mock.calls.map(([i]) => i.type);
    expect(intents).toEqual(["expand"]);
  });

  it("5) fist held past holdMs → exactly one collapse; release → no expand", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand());
    // ~700ms of committed fist (commit lands ~3 frames in, dwell ≥ 500ms after).
    for (let i = 0; i < 26; i++) interp.push((t += FPS), makeFist());
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeOpenHand());
    const intents = cb.onIntent.mock.calls.map(([i]) => i.type);
    expect(intents).toEqual(["collapse"]);
  });

  it("6) fist + horizontal palm sweep → one swipe; release → no expand/collapse", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    // Sweep cx upward while a fist is held; dt kept well within maxMs (450).
    const xs = [0.5, 0.5, 0.5, 0.5, 0.62, 0.74, 0.86];
    for (const cx of xs) interp.push((t += FPS), makeFist({ cx }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeOpenHand({ cx: 0.86 }));
    const intents = cb.onIntent.mock.calls.map(([i]) => i.type);
    expect(intents.length).toBe(1);
    expect(["swipeLeft", "swipeRight"]).toContain(intents[0]);
    // Rising cx → falling mirrored nx → dx<0 → swipeLeft.
    expect(intents[0]).toBe("swipeLeft");
  });

  it("7) opposite sweep → swipeRight; too-vertical sweep → rejected", () => {
    const right = makeCallbacks();
    const ri = createHandGestureInterpreter(right);
    let t = 0;
    ri.push(t, makeOpenHand({ cx: 0.5 }));
    const xs = [0.5, 0.5, 0.5, 0.5, 0.38, 0.26, 0.14];
    for (const cx of xs) ri.push((t += FPS), makeFist({ cx }));
    expect(right.onIntent.mock.calls.map(([i]) => i.type)).toEqual(["swipeRight"]);

    const vert = makeCallbacks();
    const vi2 = createHandGestureInterpreter(vert);
    let t2 = 0;
    vi2.push(t2, makeOpenHand({ cx: 0.5, cy: 0.5 }));
    // Large vertical move, tiny horizontal → dy/dx exceeds maxDyRatio → no swipe.
    const cys = [0.5, 0.5, 0.5, 0.5, 0.66, 0.82, 0.98];
    for (const cy of cys) vi2.push((t2 += FPS), makeFist({ cx: 0.5, cy }));
    expect(vert.onIntent.mock.calls.filter(([i]) => i.type.startsWith("swipe"))).toHaveLength(0);
  });

  it("8) cursor is frozen (no moves emitted) while a fist is held", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeFist({ cx: 0.5 })); // commit fist
    cb.onCursorMove.mockClear();
    // Palm keeps moving during the fist; cursor must NOT emit new coordinates.
    for (const cx of [0.55, 0.6, 0.65]) interp.push((t += FPS), makeFist({ cx }));
    expect(cb.onCursorMove).not.toHaveBeenCalled();
  });

  it("9) expand suppressed when the palm drifted past the click threshold", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeFist({ cx: 0.5 })); // commit fist at cx 0.5
    // Drift the palm ~0.1 in nx (> 0.06 click drift, < 0.18 swipe threshold).
    for (const cx of [0.53, 0.56, 0.57]) interp.push((t += FPS), makeFist({ cx }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeOpenHand({ cx: 0.57 }));
    expect(cb.onIntent).not.toHaveBeenCalled();
  });

  it("10) committed pinch → dragStart + pullStart; cursor frozen; no fist intents", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // commit
    const phases = phaseTypes(cb);
    expect(phases).toContain("dragStart");
    expect(phases).toContain("pullStart");
    expect(cb.onIntent).not.toHaveBeenCalled(); // no expand/collapse/swipe
    // Now that the pinch is committed the cursor stays frozen even as it moves.
    cb.onCursorMove.mockClear();
    for (const cx of [0.55, 0.6, 0.65]) interp.push((t += FPS), makePinchHand({ cx }));
    expect(cb.onCursorMove).not.toHaveBeenCalled();
  });

  it("11) pinch held past grabHoldMs → grabStart then grabMove", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 16; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 }));
    const phases = phaseTypes(cb);
    expect(phases).toContain("grabStart");
    expect(phases.indexOf("grabMove")).toBeGreaterThan(phases.indexOf("grabStart"));
  });

  it("12) moving a committed pinch emits a nonzero dragMove", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // commit
    for (const cx of [0.56, 0.62, 0.68, 0.74]) interp.push((t += FPS), makePinchHand({ cx }));
    const moves = cb.onPhase.mock.calls
      .map(([p]) => p)
      .filter((p): p is { type: "dragMove"; dx: number; dy: number; dz: number } => p.type === "dragMove");
    expect(moves.some((m) => Math.abs(m.dx) > 0)).toBe(true);
  });

  it("13) releasing a pinch ends drag+pull; fist gestures work again after", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 16; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 }));
    // Release: open the hand (thumb clears index) for enough frames to un-pinch.
    for (let i = 0; i < 5; i++) interp.push((t += FPS), makeOpenHand({ cx: 0.5 }));
    const phases = phaseTypes(cb);
    expect(phases).toContain("dragEnd");
    expect(phases).toContain("pullEnd");
    expect(phases).toContain("grabEnd");
    // A subsequent fist pulse still produces expand (fist family unbroken).
    cb.onIntent.mockClear();
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeFist({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeOpenHand({ cx: 0.5 }));
    expect(cb.onIntent.mock.calls.map(([i]) => i.type)).toEqual(["expand"]);
  });

  it("14) still flat open palm held ~1s → exactly one halt intent", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    for (; t <= DEFAULT_HAND_GESTURE.haltHoldMs + FPS; t += FPS) {
      interp.push(t, makeOpenHand({ cx: 0.5 }));
    }
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "halt")).toHaveLength(1);
  });

  it("15) a pinch never fires halt (open gate excludes pinch)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (; t <= DEFAULT_HAND_GESTURE.haltHoldMs + 2 * FPS; t += FPS) {
      interp.push(t, makePinchHand({ cx: 0.5 }));
    }
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "halt")).toHaveLength(0);
  });
});
