import { afterEach, describe, expect, it } from "vitest";

import {
  CAMERA_HOME,
  createCameraTraversal,
  type CameraTraversalConfig,
  type Vec3,
} from "@/lib/studio/camera/traversal";
import {
  FOCUS_STANDOFF,
  frameWidgetCamera,
  resolveWidgetWorldPosition,
} from "@/lib/studio/camera/framing";
import { arcZoneSlots } from "@/components/studio/cloud/layout";
import { STUDIO_WIDGET_ORDER } from "@/components/studio/data/useStudioData";
import {
  __resetZoneAssignment,
  moveWidgetToZone,
  removeWidget,
  replaceAssignment,
} from "@/lib/studio/state/zone-assignment";

/** Roomy rails so framing/pan math is un-clamped and easy to reason about. */
const wideConfig: CameraTraversalConfig = {
  panGainX: 6,
  panGainY: 6,
  dollyGain: 4,
  boundsX: [-100, 100],
  boundsY: [-100, 100],
  boundsZ: [-100, 100],
  home: [0, 1.6, 6],
};

afterEach(() => {
  __resetZoneAssignment();
});

describe("frameWidgetCamera — framing math", () => {
  it("stands off along +Z only; x/y pass through untouched", () => {
    const widget: Vec3 = [1.2, 2.3, 0.9];
    expect(frameWidgetCamera(widget)).toEqual([
      1.2,
      2.3 + 0.08,
      0.9 + FOCUS_STANDOFF,
    ]);
  });

  it("does not clamp — clamping is the controller's job", () => {
    const far: Vec3 = [999, -999, 999];
    expect(frameWidgetCamera(far)).toEqual([
      999,
      -999 + 0.08,
      999 + FOCUS_STANDOFF,
    ]);
  });
});

describe("resolveWidgetWorldPosition — the widget's current arc zone", () => {
  const ZONE_SLOTS = arcZoneSlots(STUDIO_WIDGET_ORDER.length);

  it("targets the arc slot of the widget's current zone", () => {
    // Initial assignment is identity: widget `i` sits in zone `i`.
    for (const id of ["tasks", "people"] as const) {
      const zone = STUDIO_WIDGET_ORDER.indexOf(id);
      expect(resolveWidgetWorldPosition(id)).toEqual([
        ...ZONE_SLOTS[zone]!.position,
      ]);
    }
  });

  it("follows a reflow — after a drop moves a widget, framing targets its NEW slot", () => {
    // "tasks" starts in zone 0; move it to the last zone. The insert-and-shift
    // reflow leaves it resting there, so framing must aim at that slot now.
    const last = STUDIO_WIDGET_ORDER.length - 1;
    moveWidgetToZone("tasks", last);
    expect(resolveWidgetWorldPosition("tasks")).toEqual([
      ...ZONE_SLOTS[last]!.position,
    ]);
  });

  it("returns null for a widget this window does not own (subset ownership)", () => {
    // A peer owns "tasks" — it isn't in this window's assignment anymore.
    removeWidget("tasks");
    expect(resolveWidgetWorldPosition("tasks")).toBeNull();
  });

  it("resolves slots from the OWNED subset length, not the full 8", () => {
    // This window owns just three widgets → a 3-slot arc; each resolves to its
    // slot within that arc.
    replaceAssignment(["tasks", "captures", "agenda"]);
    const subsetSlots = arcZoneSlots(3);
    expect(resolveWidgetWorldPosition("captures")).toEqual([
      ...subsetSlots[1]!.position,
    ]);
    expect(resolveWidgetWorldPosition("agenda")).toEqual([
      ...subsetSlots[2]!.position,
    ]);
  });
});

describe("camera controller — focus / blur", () => {
  it("focusOn aims at the framed position and clamps into the rails", () => {
    const c = createCameraTraversal(); // default (railed) config
    // A widget framed beyond boundsZ [3.2, 9] must clamp to 9.
    c.focusOn(frameWidgetCamera([0, 1.8, 40]));
    expect(c.getTarget()[2]).toBe(9);
    expect(c.isFocused()).toBe(true);
  });

  it("focusOn on wide rails lands exactly on the framed target", () => {
    const c = createCameraTraversal(wideConfig);
    const pos = frameWidgetCamera([1, 2, 0.5]);
    c.focusOn(pos);
    expect([...c.getTarget()]).toEqual([...pos]);
  });

  it("endFocus restores the exact pre-focus vantage", () => {
    const c = createCameraTraversal(wideConfig);
    // Move somewhere manually first, so "prior vantage" is non-home.
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0.1, dz: 0 });
    c.push({ type: "dragEnd" });
    const prior = [...c.getTarget()] as Vec3;

    c.focusOn(frameWidgetCamera([2, 2, 1]));
    expect([...c.getTarget()]).not.toEqual([...prior]);
    c.endFocus();
    expect([...c.getTarget()]).toEqual([...prior]);
    expect(c.isFocused()).toBe(false);
  });

  it("paging (focusOn while focused) keeps the ORIGINAL return vantage", () => {
    const c = createCameraTraversal(wideConfig);
    const prior = [...c.getTarget()] as Vec3; // home

    c.focusOn(frameWidgetCamera([1, 1, 0.5])); // focus widget A
    c.focusOn(frameWidgetCamera([3, 2, 1])); // page to widget B
    c.endFocus();
    expect([...c.getTarget()]).toEqual([...prior]); // back to pre-focus, not A
  });

  it("endFocus is a no-op when never focused", () => {
    const c = createCameraTraversal(wideConfig);
    const before = [...c.getTarget()] as Vec3;
    c.endFocus();
    expect([...c.getTarget()]).toEqual([...before]);
    expect(c.isFocused()).toBe(false);
  });
});

describe("camera controller — manual interruption", () => {
  it("interruptAt mid-focus re-anchors to the live camera and drops focus memory", () => {
    const c = createCameraTraversal(wideConfig);
    c.focusOn(frameWidgetCamera([2, 2, 1]));

    const live: Vec3 = [1.23, 0.45, 5.67]; // where the damp loop actually was
    c.interruptAt(live);
    expect([...c.getTarget()]).toEqual([...live]);
    expect(c.isFocused()).toBe(false);

    // A later collapse must NOT yank the camera away from where the user panned.
    c.endFocus();
    expect([...c.getTarget()]).toEqual([...live]);
  });

  it("interruptAt is a strict no-op when NOT focused (manual-pan guard)", () => {
    const c = createCameraTraversal(wideConfig);
    const before = [...c.getTarget()] as Vec3;
    c.interruptAt([9, 9, 9]);
    expect([...c.getTarget()]).toEqual([...before]);
    expect(c.isFocused()).toBe(false);
  });

  it("focus → dragStart(interrupt) → dragMove pans from the interrupted spot", () => {
    const c = createCameraTraversal(wideConfig);
    c.focusOn(frameWidgetCamera([2, 2, 1]));

    // The rig calls interruptAt(camera.position) BEFORE push(dragStart).
    const live: Vec3 = [1, 1, 5];
    c.interruptAt(live);
    c.push({ type: "dragStart" });
    c.push({ type: "dragMove", dx: 0.1, dy: 0, dz: 0 });

    // Pan is measured off the interrupted spot (base = live), not the focus frame.
    expect(c.getTarget()[0]).toBeCloseTo(live[0] - 0.1 * wideConfig.panGainX, 6);
    expect(c.getTarget()[1]).toBeCloseTo(live[1], 6);
  });
});

describe("camera controller — home clears focus memory", () => {
  it("goHome resets to home and forgets focus", () => {
    const c = createCameraTraversal(wideConfig);
    c.focusOn(frameWidgetCamera([2, 2, 1]));
    c.goHome();
    expect([...c.getTarget()]).toEqual([...CAMERA_HOME]);
    expect(c.isFocused()).toBe(false);
    // endFocus after home is a no-op — no stale return target.
    c.endFocus();
    expect([...c.getTarget()]).toEqual([...CAMERA_HOME]);
  });
});
