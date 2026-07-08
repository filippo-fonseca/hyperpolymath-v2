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

  it("4b) a steady index point held past the dwell → exactly one expand", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    for (; t <= 2 * DEFAULT_HAND_GESTURE.pointDwellMs; t += FPS) {
      interp.push(t, makePoint({ cx: 0.5 }));
    }
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "expand")).toHaveLength(1);
  });

  it("4c) a forward index TAP opens immediately, before the dwell elapses", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    // Commit the point at rest, then a quick forward poke (rising -z) — fires well
    // under the dwell window, so it's the tap path, not the hold path.
    for (let i = 0; i < 5; i++) interp.push((t += FPS), makePoint({ cx: 0.5, forward: 0 }));
    for (let i = 0; i < 6; i++) interp.push((t += FPS), makePoint({ cx: 0.5, forward: 0.8 }));
    expect(t).toBeLessThan(DEFAULT_HAND_GESTURE.pointDwellMs);
    expect(cb.onIntent.mock.calls.filter(([i]) => i.type === "expand")).toHaveLength(1);
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

  it("9) a wandering point never opens — only a still (or tapped) point does", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    // Keep the point sliding sideways past the drift gate every frame: the dwell
    // clock re-anchors constantly and never matures, so no expand for 2× the dwell.
    let cx = 0.3;
    for (; t <= 2 * DEFAULT_HAND_GESTURE.pointDwellMs; t += FPS) {
      cx += 0.08; // > pointMaxDriftNx once remapped
      if (cx > 0.7) cx = 0.3;
      interp.push(t, makePoint({ cx }));
    }
    expect(cb.onIntent).not.toHaveBeenCalled();
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

  it("16) tightening the thumb-index gap dollies in; widening dollies out", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    // Engage + settle the smoothed ratio at a moderate gap (baseline for zoom).
    for (let i = 0; i < 10; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.3 }));
    // Squeeze tighter and hold: closer than the baseline ⇒ dolly IN (dz > 0).
    for (let i = 0; i < 10; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.1 }));
    const zoomedIn = lastDrag(cb)!.dz;
    expect(zoomedIn).toBeGreaterThan(0);
    // Widen well past the baseline (still inside the pinch band, gap < offRatio)
    // and hold: wider than the baseline ⇒ dolly OUT relative to the squeeze.
    for (let i = 0; i < 10; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.5 }));
    const widened = lastDrag(cb)!.dz;
    expect(widened).toBeLessThan(zoomedIn);
  });

  it("17) panning at a constant gap dollies nothing (pan/zoom decoupled)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    // Hold long enough that the smoothed ratio settles and the dolly stops moving.
    for (let i = 0; i < 50; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.2 }));
    const settled = lastDrag(cb)!;
    // Translate the whole hand across frame while the gap is held fixed. The
    // thumb tip is not a palm anchor, so the pan can't leak into the dolly.
    for (const cx of [0.56, 0.62, 0.68, 0.74]) {
      interp.push((t += FPS), makePinchHand({ cx, gap: 0.2 }));
    }
    const panned = lastDrag(cb)!;
    expect(Math.abs(panned.dx)).toBeGreaterThan(Math.abs(settled.dx)); // pan grows
    expect(panned.dz).toBe(settled.dz); // dolly untouched by the pan
  });

  it("18) modulating the gap in place dollies without panning (decoupled)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    for (let i = 0; i < 20; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.35 }));
    const settled = lastDrag(cb)!;
    // Squeeze in place (cx fixed): only the thumb/index gap changes, and neither
    // point is a palm anchor, so the centroid — and thus dx/dy — never moves.
    for (let i = 0; i < 20; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.1 }));
    const squeezed = lastDrag(cb)!;
    expect(squeezed.dz).toBeGreaterThan(settled.dz); // dolly moved
    expect(squeezed.dx).toBe(settled.dx); // no pan
    expect(squeezed.dy).toBe(settled.dy);
  });

  it("19) a still, steadily-held pinch holds a steady dolly (emit quantum)", () => {
    const interp = createHandGestureInterpreter(cb);
    let t = 0;
    interp.push(t, makeOpenHand({ cx: 0.5 }));
    // Settle the smoothed ratio, then sample two late frames: once the dolly
    // target stops moving, the emit quantum holds z constant frame-to-frame.
    for (let i = 0; i < 50; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.15 }));
    const first = lastDrag(cb)!.dz;
    for (let i = 0; i < 8; i++) interp.push((t += FPS), makePinchHand({ cx: 0.5, gap: 0.15 }));
    const later = lastDrag(cb)!.dz;
    expect(later).toBe(first); // identical gap ⇒ identical target ⇒ camera settles
  });
});
