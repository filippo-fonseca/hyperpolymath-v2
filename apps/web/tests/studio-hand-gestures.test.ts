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
 * A pinch: fingers extended (open pose) but the thumb tip laid near the index
 * tip, so the pinch ratio collapses under `pinchOnRatio`. With no `gap` the
 * thumb sits ON the index tip (ratio ≈ 0). Pass `gap` to place the thumb a
 * precise thumb-index distance away: palm size is `scale`, so the resulting
 * pinch ratio equals `gap` exactly (drives the zoom scalar in the e2e tests).
 */
const makePinchHand = (
  o: { cx?: number; cy?: number; scale?: number; gap?: number } = {},
): Pt[] => {
  const { gap, ...rest } = o;
  const lm = makeHand({ ...rest, tipRatio: 2.0 });
  if (gap === undefined) {
    lm[4] = { ...lm[8]! }; // thumb tip onto index tip → ratio ≈ 0
  } else {
    const s = rest.scale ?? 0.2; // palm size = dist(wrist, middle-MCP) = scale
    const tip = lm[8]!;
    lm[4] = { x: tip.x + gap * s, y: tip.y, z: 0 }; // |thumb−index| = gap·s ⇒ ratio = gap
  }
  return lm;
};

/**
 * A point: index extended (ratio ≈ 2) with middle/ring/pinky curled (ratio ≈ 1.1),
 * so the finger pattern is index-only → pose "point". `forward` sets index-tip z
 * (negative ⇒ nearer the camera) so a forward tap can be simulated.
 */
const makePoint = (
  o: { cx?: number; cy?: number; scale?: number; forward?: number } = {},
): Pt[] => {
  const { cx = 0.5, cy = 0.5, scale = 0.2, forward = 0 } = o;
  const lm = makeHand({ cx, cy, scale, tipRatio: 2.0 });
  const curlY = cy + scale - 1.1 * scale; // dist(wrist,tip) = 1.1·scale ⇒ curled
  for (const tip of [12, 16, 20]) lm[tip] = { x: cx, y: curlY, z: 0 };
  lm[8] = { ...lm[8]!, z: -forward }; // forward>0 ⇒ nearer camera (z<0)
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

type DragMove = { type: "dragMove"; dx: number; dy: number; dz: number };
const dragMoves = (cb: ReturnType<typeof makeCallbacks>): DragMove[] =>
  cb.onPhase.mock.calls
    .map(([p]) => p)
    .filter((p): p is DragMove => p.type === "dragMove");
const lastDrag = (cb: ReturnType<typeof makeCallbacks>): DragMove | undefined =>
  dragMoves(cb).at(-1);

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

  it("pinch ratio equals the requested gap (the zoom driver's input)", () => {
    expect(computePinchRatio(makePinchHand({ gap: 0.3 }))).toBeCloseTo(0.3, 6);
    expect(computePinchRatio(makePinchHand({ gap: 0.1 }))).toBeCloseTo(0.1, 6);
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

  it("4) a quick fist pulse no longer opens — the fist is close-only now", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand()); // establish open
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeFist()); // commit fist (~<200ms)
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makeOpenHand()); // release
    expect(cb.onIntent).not.toHaveBeenCalled();
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

  it("10) committed pinch → dragStart; cursor frozen; no fist intents", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // commit
    const phases = phaseTypes(cb);
    expect(phases).toContain("dragStart");
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

  it("13) releasing a pinch ends drag; fist gestures work again after", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 16; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 }));
    // Release: open the hand (thumb clears index) and sustain it past the release
    // grace (pinchReleaseGraceMs 150 ≈ 5 frames at 30fps) so the pinch truly ends.
    for (let i = 0; i < 7; i++) interp.push((t += FPS), makeOpenHand({ cx: 0.5 }));
    const phases = phaseTypes(cb);
    expect(phases).toContain("dragEnd");
    expect(phases).toContain("grabEnd");
    // A subsequent held fist still collapses (fist family unbroken after a pinch).
    cb.onIntent.mockClear();
    for (let i = 0; i < 26; i++) interp.push((t += FPS), makeFist({ cx: 0.5 }));
    expect(cb.onIntent.mock.calls.map(([i]) => i.type)).toEqual(["collapse"]);
  });

  it("13b) a brief un-pinch blip mid-drag never drops the pan (no re-anchor)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // commit
    for (const cx of [0.56, 0.62]) interp.push((t += FPS), makePinchHand({ cx })); // drag
    const before = lastDrag(cb)!;
    // A 3-frame tracker un-pinch blip (~100ms < 150ms grace): the ratio pops open
    // while the hand keeps translating. The pinch must survive it.
    for (const cx of [0.66, 0.7, 0.74]) interp.push((t += FPS), makeOpenHand({ cx }));
    for (const cx of [0.8, 0.86]) interp.push((t += FPS), makePinchHand({ cx })); // resume
    const phases = phaseTypes(cb);
    expect(phases.filter((p) => p === "dragEnd")).toHaveLength(0);
    expect(phases.filter((p) => p === "dragStart")).toHaveLength(1); // one origin, no re-anchor
    const after = lastDrag(cb)!;
    // Same direction, larger magnitude ⇒ cumulative from the ORIGINAL origin.
    expect(Math.sign(after.dx)).toBe(Math.sign(before.dx));
    expect(Math.abs(after.dx)).toBeGreaterThan(Math.abs(before.dx));
  });

  it("13c) a short hand-lost gap mid-pinch keeps the drag alive (soft reacquire)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // commit
    for (const cx of [0.56, 0.62]) interp.push((t += FPS), makePinchHand({ cx }));
    const before = lastDrag(cb)!;
    interp.push((t += FPS), null); // a single dropped frame (~33ms < 200ms grace)
    for (const cx of [0.68, 0.74]) interp.push((t += FPS), makePinchHand({ cx })); // resume
    const phases = phaseTypes(cb);
    expect(phases.filter((p) => p === "dragEnd")).toHaveLength(0);
    expect(phases.filter((p) => p === "dragStart")).toHaveLength(1); // one origin
    const after = lastDrag(cb)!;
    expect(Math.abs(after.dx)).toBeGreaterThan(Math.abs(before.dx));
  });

  it("13d) a hand loss past the pinch-lost grace ends the drag and fully resets", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // commit
    interp.push((t += FPS), makePinchHand({ cx: 0.56 }));
    interp.push((t += FPS), null); // nullSince anchored here
    t += 9 * FPS; // ~300ms > pinchLostGraceMs (200) — a genuine long loss
    interp.push(t, makePinchHand({ cx: 0.62 }));
    const phases = phaseTypes(cb);
    expect(phases).toContain("dragEnd"); // reset fired on reacquire
    // The reset cleared pinchActive, so the resumed frame must re-debounce the
    // pinch rather than instantly re-opening a drag from the reset origin.
    expect(phases.filter((p) => p === "dragStart")).toHaveLength(1);
  });

  it("14) open palm PUSHED toward the camera and held → exactly one halt intent", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    // Baseline: a relaxed open palm at aiming distance sets the reference size.
    interp.push(t, makeOpenHand({ cx: 0.5, scale: 0.2 }));
    // Then shove it toward the camera (larger apparent palm) and hold still. Give
    // ample time for the smoothed size to clear the push gate + the dwell window.
    for (t = FPS; t <= 3 * DEFAULT_HAND_GESTURE.haltHoldMs; t += FPS) {
      interp.push(t, makeOpenHand({ cx: 0.5, scale: 0.34 }));
    }
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "halt")).toHaveLength(1);
  });

  it("14b) REGRESSION: a relaxed, still open palm (no push) never halts", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    // The natural aiming pose: open palm held steady at a constant distance.
    for (; t <= 3 * DEFAULT_HAND_GESTURE.haltHoldMs; t += FPS) {
      interp.push(t, makeOpenHand({ cx: 0.5, scale: 0.2 }));
    }
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "halt")).toHaveLength(0);
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

  it("16) a growing palm (hand approaching) dollies in; a shrinking palm dollies out", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5, scale: 0.2 }));
    // Engage the pinch and settle at the baseline palm size (dolly ≈ 0 here).
    for (let i = 0; i < 6; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.2 }));
    // Grow the palm (hand moves toward the camera): bigger than baseline ⇒ dolly IN.
    for (let i = 0; i < 15; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.3 }));
    const approached = lastDrag(cb)!.dz;
    expect(approached).toBeGreaterThan(0);
    // Shrink well below the baseline (hand recedes): smaller ⇒ dolly OUT (dz < 0).
    for (let i = 0; i < 15; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.14 }));
    const receded = lastDrag(cb)!.dz;
    expect(receded).toBeLessThan(0);
    expect(receded).toBeLessThan(approached);
  });

  it("17) panning at a constant palm size dollies nothing (pan/dolly decoupled)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5, scale: 0.2 }));
    // Hold at the baseline size long enough that pan and dolly both settle.
    for (let i = 0; i < 50; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.2 }));
    const settled = lastDrag(cb)!;
    // Translate the hand across frame at a FIXED palm size. Pan reads the palm
    // centroid; dolly reads palm size — a constant size can't leak into the dolly.
    for (const cx of [0.56, 0.62, 0.68, 0.74]) {
      interp.push((t += FPS), makePinchHand({ cx, scale: 0.2 }));
    }
    const panned = lastDrag(cb)!;
    expect(Math.abs(panned.dx)).toBeGreaterThan(Math.abs(settled.dx)); // pan grows
    expect(panned.dz).toBe(settled.dz); // dolly untouched by the pan
  });

  it("18) a still, steadily-held pinch holds a steady dolly (emit quantum)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5, scale: 0.2 }));
    // Engage at the baseline, then approach and hold: once the dolly target stops
    // moving, the emit quantum pins z constant frame-to-frame (rig settles).
    for (let i = 0; i < 6; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.2 }));
    for (let i = 0; i < 50; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.3 }));
    const first = lastDrag(cb)!.dz;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, scale: 0.3 }));
    const later = lastDrag(cb)!.dz;
    expect(later).toBe(first); // identical size ⇒ identical target ⇒ camera settles
  });

  it("19) bloom-open: a quick pinch sprung open emits one expand; cursor frozen while pinched", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    // Commit a pinch and hold it briefly, well under grabHoldMs (350) ⇒ a bloom.
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5 }));
    cb.onCursorMove.mockClear();
    interp.push((t += FPS), makePinchHand({ cx: 0.5 })); // still pinched
    expect(cb.onCursorMove).not.toHaveBeenCalled(); // cursor frozen while pinched
    // Spring the hand open and sustain past the release grace so the latch falls.
    for (let i = 0; i < 8; i++) interp.push((t += FPS), makeOpenHand({ cx: 0.5 }));
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "expand")).toHaveLength(1);
    expect(phaseTypes(cb)).not.toContain("grabStart"); // released before the grab threshold
  });

  it("20) a point pose still steers the cursor (open||point steering preserved)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    for (let i = 0; i < 4; i++) interp.push((t += FPS), makePoint({ cx: 0.5 })); // commit point
    cb.onCursorMove.mockClear();
    // Unlike a fist or a pinch (both freeze the cursor), a moving point tracks it.
    for (const cx of [0.55, 0.6, 0.65]) interp.push((t += FPS), makePoint({ cx }));
    expect(cb.onCursorMove).toHaveBeenCalled();
    expect(cb.onIntent).not.toHaveBeenCalled(); // steering only — a point never opens
  });
});
