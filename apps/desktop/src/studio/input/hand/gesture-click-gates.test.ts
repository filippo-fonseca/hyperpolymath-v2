import { describe, expect, it } from "vitest";

import {
  createScrollCurlGate,
  computeIndexTipDepth,
  DEFAULT_HAND_GESTURE,
  resizeEngageAllowed,
  type Pt,
} from "./gesture-core";
import { createFourFingerScrollRecognizer } from "../four-finger-scroll-recognizer";
import { createPalmClickRecognizer, type PalmClickSample } from "../palm-click-recognizer";
import type { StudioIntentInput, StudioPhaseInput } from "../types";

const CEIL = DEFAULT_HAND_GESTURE.scrollArmOpennessCeil; // 1.6 — top of the curl band
const CLOSED = DEFAULT_HAND_GESTURE.palmClickOpennessThreshold; // 1.35 — closed
const SUSTAIN = DEFAULT_HAND_GESTURE.scrollCurlSustainMs; // 250

function gate() {
  return createScrollCurlGate({
    sustainMs: SUSTAIN,
    armOpennessCeil: CEIL,
    closedOpenness: CLOSED,
  });
}

// ── (a) scroll-curl dwell gate ───────────────────────────────────────────────

describe("createScrollCurlGate (Job 1a)", () => {
  it("stays disengaged while the hand is merely held open (above the arm ceil)", () => {
    const g = gate();
    // Openness 1.9 (fully open) is NOT a curl candidate: never engages however long.
    for (let t = 0; t <= 1000; t += 16) {
      expect(g.push(t, true, 1.9)).toBe(false);
    }
  });

  it("engages only after the curl candidate has been sustained scrollCurlSustainMs", () => {
    const g = gate();
    const mid = (CEIL + CLOSED) / 2; // inside the curl band [CLOSED, CEIL)
    expect(g.push(0, true, mid)).toBe(false); // first candidate frame — clock starts
    expect(g.push(SUSTAIN - 1, true, mid)).toBe(false); // still short of the dwell
    expect(g.push(SUSTAIN, true, mid)).toBe(true); // dwell met → engaged
    expect(g.push(SUSTAIN + 100, true, mid)).toBe(true); // stays engaged
  });

  it("resets the dwell whenever the candidate breaks (open hand, or full closure)", () => {
    const g = gate();
    const mid = (CEIL + CLOSED) / 2;
    g.push(0, true, mid);
    g.push(100, true, mid);
    // Hand snaps back fully open — candidate broken, clock reset.
    expect(g.push(120, true, 1.9)).toBe(false);
    // Curl again: the dwell restarts from here, so 200ms later is still not enough.
    expect(g.push(140, true, mid)).toBe(false);
    expect(g.push(140 + SUSTAIN - 1, true, mid)).toBe(false);
    expect(g.push(140 + SUSTAIN, true, mid)).toBe(true);
  });

  it("treats a fully-closed hand (below the closed threshold) as a non-candidate", () => {
    const g = gate();
    for (let t = 0; t <= 1000; t += 16) {
      expect(g.push(t, true, 1.05)).toBe(false); // a fist, not a scroll curl
    }
  });

  it("a <600ms palm-click close-open round trip yields ZERO scroll deltas", () => {
    const g = gate();
    const events: StudioPhaseInput[] = [];
    const scroll = createFourFingerScrollRecognizer((e) => events.push(e));

    // Openness path: open (1.9) → curl to a fist (1.05) → reopen (1.9), ~480ms
    // total (< the 600ms reopen window). openPose drops out below the closed band
    // (the pose classifier reads "fist" there). Feed both through the gate.
    const frames: Array<{ t: number; openness: number }> = [];
    let t = 0;
    for (let o = 1.9; o >= 1.05; o -= 0.06, t += 16) frames.push({ t, openness: o }); // ~224ms down
    for (let k = 0; k < 3; k++, t += 16) frames.push({ t, openness: 1.05 }); // fist dwell
    for (let o = 1.05; o <= 1.9; o += 0.06, t += 16) frames.push({ t, openness: o }); // ~224ms up

    for (const f of frames) {
      const openPose = f.openness > CLOSED; // pose reads open only above the closed band
      const engaged = g.push(f.t, openPose, f.openness);
      scroll.push({ t: f.t, openness: f.openness, engaged });
    }
    expect(t).toBeLessThan(600); // the whole round trip is under the reopen window
    expect(events.filter((e) => e.type === "scrollMove")).toEqual([]);
    expect(events).toEqual([]); // not even a scrollStart armed
  });

  it("a sustained curl DOES scroll once armed (the gate isn't just an off switch)", () => {
    const g = gate();
    const events: StudioPhaseInput[] = [];
    const scroll = createFourFingerScrollRecognizer((e) => events.push(e));
    const push = (t: number, openness: number): void => {
      const engaged = g.push(t, true, openness);
      scroll.push({ t, openness, engaged });
    };
    // Hold a steady half-curl inside the band long enough to arm...
    let t = 0;
    for (; t <= SUSTAIN + 32; t += 16) push(t, 1.48);
    // ...then curl a little further, fast enough to clear the velocity deadband
    // (0.08 openness in 16ms ≈ 5 units/s ≫ the 0.9 minVelocity) while staying in
    // the band so the gate keeps it engaged.
    push(t, 1.4);
    expect(events.some((e) => e.type === "scrollStart")).toBe(true);
    expect(events.some((e) => e.type === "scrollMove")).toBe(true);
  });
});

// ── (b) resize disarms during a click candidate ──────────────────────────────

describe("resizeEngageAllowed (Job 1b)", () => {
  it("allows resize for an open, non-pinching hand with no click in flight", () => {
    expect(resizeEngageAllowed(true, false, false, 1.85, CLOSED)).toBe(true);
  });

  it("disarms while a palm-click candidate is in flight (closing)", () => {
    expect(resizeEngageAllowed(true, false, true, 1.85, CLOSED)).toBe(false);
  });

  it("disarms once the hand curls into the closed band (pre-fist ramp)", () => {
    expect(resizeEngageAllowed(true, false, false, CLOSED - 0.1, CLOSED)).toBe(false);
  });

  it("stays disarmed while pinching or not an open pose", () => {
    expect(resizeEngageAllowed(true, true, false, 1.85, CLOSED)).toBe(false);
    expect(resizeEngageAllowed(false, false, false, 1.85, CLOSED)).toBe(false);
  });

  it("does NOT fight a deliberate shrink (still well above the closed band)", () => {
    expect(resizeEngageAllowed(true, false, false, 1.5, CLOSED)).toBe(true);
  });
});

// ── (c) the index-jab is retired as a click source ───────────────────────────

describe("index-jab tap retirement (Job 1c)", () => {
  it("keeps computeIndexTipDepth as a shared geometry helper", () => {
    const rest: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    rest[0] = { x: 0.5, y: 0.9, z: 0 }; // WRIST
    rest[9] = { x: 0.5, y: 0.7, z: 0 }; // MIDDLE_MCP → palm size 0.2
    expect(typeof computeIndexTipDepth(rest)).toBe("number");
  });

  it("a forward index jab (hand never closes) fires NO tap — only close-open clicks", () => {
    const events: StudioIntentInput[] = [];
    const rec = createPalmClickRecognizer((i) => events.push(i));
    const AIM = { nx: 0.4, ny: 0.6 };
    // A jab pokes the index forward but the hand stays open/pointing — `closed`
    // never rises, so the retired jab-click has no path to a `tap` anymore.
    const jab: PalmClickSample[] = [
      { t: 0, closed: false, ...AIM, engaged: true },
      { t: 16, closed: false, ...AIM, engaged: true },
      { t: 32, closed: false, ...AIM, engaged: true },
      { t: 48, closed: false, ...AIM, engaged: true },
    ];
    for (const s of jab) rec.push(s);
    expect(events).toEqual([]);
  });
});
