import { describe, expect, it } from "vitest";

import {
  CAMERA_HOME,
  DEFAULT_CAMERA_TRAVERSAL_CONFIG as CFG,
  createCameraTraversal,
  type CameraTraversalConfig,
} from "@/lib/studio/camera/traversal";

/** A roomy config with symmetric rails so pan/dolly math is easy to reason about. */
const wideConfig: CameraTraversalConfig = {
  panGainX: 6,
  panGainY: 6,
  dollyGain: 4,
  boundsX: [-100, 100],
  boundsY: [-100, 100],
  boundsZ: [-100, 100],
  home: [0, 1.6, 6],
};

describe("createCameraTraversal — initial state", () => {
  it("starts at CAMERA_HOME", () => {
    const c = createCameraTraversal();
    expect([...c.getTarget()]).toEqual([...CAMERA_HOME]);
  });

  it("home matches the StudioCanvas spawn position", () => {
    expect(CFG.home).toEqual(CAMERA_HOME);
  });
});

describe("createCameraTraversal — grab-the-world sign conventions", () => {
  it("hand right (dx>0) moves the camera LEFT (−x)", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.5, dy: 0, dz: 0 });
    expect(c.getTarget()[0]).toBeCloseTo(0 - 0.5 * wideConfig.panGainX, 6);
    expect(c.getTarget()[0]).toBeLessThan(0);
  });

  it("hand down (dy>0, ny grows downward) moves the camera UP (+y)", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0, dy: 0.5, dz: 0 });
    expect(c.getTarget()[1]).toBeCloseTo(1.6 + 0.5 * wideConfig.panGainY, 6);
    expect(c.getTarget()[1]).toBeGreaterThan(1.6);
  });

  it("hand toward the camera (dz>0) dollies IN (−z)", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0, dy: 0, dz: 0.5 });
    expect(c.getTarget()[2]).toBeCloseTo(6 - 0.5 * wideConfig.dollyGain, 6);
    expect(c.getTarget()[2]).toBeLessThan(6);
  });

  it("hand away (dz<0) dollies OUT (+z)", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0, dy: 0, dz: -0.5 });
    expect(c.getTarget()[2]).toBeGreaterThan(6);
  });

  it("maps all three axes simultaneously", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0.2, dz: 0.3 });
    expect([...c.getTarget()]).toEqual([
      0 - 0.1 * 6,
      1.6 + 0.2 * 6,
      6 - 0.3 * 4,
    ]);
  });
});

describe("createCameraTraversal — cumulative anchoring (not integration)", () => {
  it("re-sent cumulative deltas do not compound", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 });
    const once = [...c.getTarget()];
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 });
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 });
    expect([...c.getTarget()]).toEqual(once);
  });

  it("a dropped frame costs nothing — jumping straight to the final delta lands identically", () => {
    const a = createCameraTraversal(wideConfig);
    a.push({ type: "dragStart" });
    a.push({ type: "dragMove", dx: 0.1, dy: 0.1, dz: 0.1 });
    a.push({ type: "dragMove", dx: 0.4, dy: 0.2, dz: 0.3 });

    const b = createCameraTraversal(wideConfig);
    b.push({ type: "dragStart" });
    b.push({ type: "dragMove", dx: 0.4, dy: 0.2, dz: 0.3 });

    expect([...a.getTarget()]).toEqual([...b.getTarget()]);
  });
});

describe("createCameraTraversal — AABB clamping", () => {
  it("clamps x to the lower and upper rails", () => {
    const c = createCameraTraversal(CFG);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 100, dy: 0, dz: 0 }); // huge → camera far −x
    expect(c.getTarget()[0]).toBe(CFG.boundsX[0]);
    c.push({ type: "dragMove", dx: -100, dy: 0, dz: 0 }); // huge → camera far +x
    expect(c.getTarget()[0]).toBe(CFG.boundsX[1]);
  });

  it("clamps y to the lower and upper rails", () => {
    const c = createCameraTraversal(CFG);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0, dy: -100, dz: 0 });
    expect(c.getTarget()[1]).toBe(CFG.boundsY[0]);
    c.push({ type: "dragMove", dx: 0, dy: 100, dz: 0 });
    expect(c.getTarget()[1]).toBe(CFG.boundsY[1]);
  });

  it("clamps z to the lower and upper rails (never clips through tiles or into the void)", () => {
    const c = createCameraTraversal(CFG);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0, dy: 0, dz: 100 }); // dolly hard IN
    expect(c.getTarget()[2]).toBe(CFG.boundsZ[0]);
    c.push({ type: "dragMove", dx: 0, dy: 0, dz: -100 }); // dolly hard OUT
    expect(c.getTarget()[2]).toBe(CFG.boundsZ[1]);
  });

  it("z lower rail stays clear of the nearest tile face (z ≈ 2.4)", () => {
    expect(CFG.boundsZ[0]).toBeGreaterThan(2.4);
  });

  it("clamps each axis independently — a railed axis does not poison the others", () => {
    const c = createCameraTraversal(CFG);
    c.push({ type: "dragStart" });
    // x pinned to a rail, y a small in-bounds move.
    c.push({ type: "dragMove", dx: 100, dy: 0.05, dz: 0 });
    expect(c.getTarget()[0]).toBe(CFG.boundsX[0]);
    expect(c.getTarget()[1]).toBeCloseTo(1.6 + 0.05 * CFG.panGainY, 6);
  });
});

describe("createCameraTraversal — drag lifecycle", () => {
  it("dragEnd commits: a second drag re-anchors from the committed position", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 }); // x = -0.6
    c.push({ type: "dragEnd" });
    const committed = [...c.getTarget()];

    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 }); // another -0.6 from committed
    expect(c.getTarget()[0]).toBeCloseTo(committed[0]! - 0.1 * 6, 6);
  });

  it("dragMove before dragStart is ignored", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragMove", dx: 0.5, dy: 0.5, dz: 0.5 });
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
  });

  it("dragEnd without any dragMove is a no-op (hand lost mid-pinch)", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragEnd" });
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
  });
});

describe("createCameraTraversal — grab yield", () => {
  it("grabStart mid-drag reverts the accidental pan to the baseline", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.3, dy: 0.3, dz: 0 }); // ~250 ms of pan
    c.push({ type: "grabStart", targetId: "tasks" });
    expect([...c.getTarget()]).toEqual([...wideConfig.home]); // reverted
  });

  it("suppresses all dragMove until the terminal dragEnd", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "grabStart", targetId: "tasks" });
    c.push({ type: "dragMove", dx: 0.9, dy: 0.9, dz: 0.9 }); // ignored
    c.push({ type: "grabMove", nx: 0.4, ny: 0.4 }); // ignored
    c.push({ type: "grabEnd" }); // ignored (still suppressed until dragEnd)
    c.push({ type: "dragMove", dx: 0.9, dy: 0.9, dz: 0.9 }); // still ignored
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
  });

  it("a fresh drag after a grabbed one pans normally again", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "grabStart", targetId: "tasks" });
    c.push({ type: "dragEnd" }); // clears suppression

    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.2, dy: 0, dz: 0 });
    expect(c.getTarget()[0]).toBeCloseTo(0 - 0.2 * 6, 6);
  });
});

describe("createCameraTraversal — pull events are ignored", () => {
  it("pullStart / pullDelta / pullEnd never move the camera", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "pullStart" });
    c.push({ type: "pullDelta", delta: 0.9 });
    c.push({ type: "pullEnd" });
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
  });
});

describe("createCameraTraversal — home & reset", () => {
  it("goHome returns the target to home", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.4, dy: 0.4, dz: 0.4 });
    c.push({ type: "dragEnd" });
    c.goHome();
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
  });

  it("goHome re-anchors: the next drag measures from home", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.4, dy: 0, dz: 0 });
    c.push({ type: "dragEnd" });
    c.goHome();
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 });
    expect(c.getTarget()[0]).toBeCloseTo(wideConfig.home[0] - 0.1 * 6, 6);
  });

  it("reset mid-drag cancels the in-progress drag and returns home", () => {
    const c = createCameraTraversal(wideConfig);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.4, dy: 0.4, dz: 0.4 });
    c.reset();
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
    // A dangling dragMove after reset is ignored (drag was cancelled).
    c.push({ type: "dragMove", dx: 0.9, dy: 0.9, dz: 0.9 });
    expect([...c.getTarget()]).toEqual([...wideConfig.home]);
  });
});
