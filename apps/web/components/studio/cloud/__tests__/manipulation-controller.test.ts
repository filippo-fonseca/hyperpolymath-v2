import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  __resetWidgetTransforms,
  getWidgetTransform,
  SCALE_MAX,
} from "@/lib/studio/state/widget-transforms";
import type { StudioWidgetId } from "@/components/studio/data/useStudioData";
import type { StudioPhaseEvent } from "@/lib/studio/input/types";
import { LIFT } from "../manipulation-math";
import {
  createManipulationController,
  type ManipulationController,
} from "../manipulation-controller";
import type { TileSlot } from "../layout";

// Three widgets on the X axis, spaced 3 apart — well beyond BLOCK_RADIUS (0.9),
// so no anchor ever blocks another and snapping stays deterministic.
const SLOTS: TileSlot[] = [
  { position: [0, 0, 0] },
  { position: [3, 0, 0] },
  { position: [6, 0, 0] },
];
const IDS: StudioWidgetId[] = ["tasks", "captures", "agenda"];

interface Harness {
  controller: ManipulationController;
  groups: Map<StudioWidgetId, THREE.Group>;
  invalidate: ReturnType<typeof vi.fn>;
  /** Set the injected focus head the pull falls back to. */
  setActive: (id: StudioWidgetId | null) => void;
  /** Move a widget's group to a world position (before a grab, to seed it). */
  place: (id: StudioWidgetId, p: [number, number, number]) => void;
  send: (phase: StudioPhaseEvent) => void;
}

function makeHarness(): Harness {
  const groups = new Map<StudioWidgetId, THREE.Group>();
  for (let i = 0; i < IDS.length; i++) {
    const g = new THREE.Group();
    const slot = SLOTS[i]!.position;
    g.position.set(slot[0], slot[1], slot[2]);
    groups.set(IDS[i]!, g);
  }

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.6, 6);

  const invalidate = vi.fn();
  let active: StudioWidgetId | null = null;

  const controller = createManipulationController({
    slots: SLOTS,
    widgetIds: IDS,
    getGroup: (id) => groups.get(id) ?? null,
    camera,
    invalidate,
    getActiveHead: () => active,
  });

  return {
    controller,
    groups,
    invalidate,
    setActive: (id) => {
      active = id;
    },
    place: (id, p) => {
      groups.get(id)!.position.set(p[0], p[1], p[2]);
    },
    send: (phase) => controller.handlePhase(phase),
  };
}

const scaleOf = (h: Harness, id: StudioWidgetId): number =>
  h.groups.get(id)!.scale.x;

beforeEach(() => {
  __resetWidgetTransforms();
});

describe("pull on the active widget", () => {
  it("commits the resized scale, clamped to the ceiling", () => {
    const h = makeHarness();
    h.setActive("tasks");

    h.send({ type: "pullStart" });
    h.send({ type: "pullDelta", delta: 5 }); // 2^5 → clamps to SCALE_MAX
    expect(scaleOf(h, "tasks")).toBeCloseTo(SCALE_MAX, 6);

    h.send({ type: "pullEnd" });
    expect(getWidgetTransform("tasks").scale).toBe(SCALE_MAX);
  });

  it("is an inert no-op when neither a grab nor an active head exists", () => {
    const h = makeHarness();
    h.setActive(null);

    expect(() => {
      h.send({ type: "pullStart" });
      h.send({ type: "pullDelta", delta: 0.5 });
      h.send({ type: "pullEnd" });
    }).not.toThrow();

    for (const id of IDS) {
      expect(getWidgetTransform(id).scale).toBeNull();
      expect(getWidgetTransform(id).position).toBeNull();
    }
  });
});

describe("CR-01 — grabEnd commits an in-flight resize (no orphaned scale)", () => {
  it("persists the pulled scale on grabEnd even if pullEnd never arrives", () => {
    const h = makeHarness();
    // tasks sits on its own slot, so the position settles to null and the scale
    // is what we isolate.
    h.send({ type: "grabStart", targetId: "tasks" });
    h.send({ type: "pullDelta", delta: 0.5 }); // grab owns the pull → 2^0.5

    // grabEnd WITHOUT a following pullEnd. The store must still carry the scale.
    h.send({ type: "grabEnd" });

    expect(getWidgetTransform("tasks").scale).toBeCloseTo(Math.SQRT2, 10);
    expect(scaleOf(h, "tasks")).toBeCloseTo(Math.SQRT2, 10); // lift dropped
    expect(getWidgetTransform("tasks").position).toBeNull(); // snapped to own slot
  });
});

describe("CR-02 — a grab owns the pull (late pullStart cannot steal it)", () => {
  it("ignores a pullStart fired mid-grab and never repoints onto the active head", () => {
    const h = makeHarness();
    h.setActive("captures"); // the head a stray pullStart would wrongly grab

    h.send({ type: "grabStart", targetId: "tasks" });
    h.send({ type: "pullStart" }); // must no-op: grab owns the pull
    h.send({ type: "pullDelta", delta: 0.5 });

    // The grabbed widget grows; the active head is never touched.
    expect(scaleOf(h, "tasks")).toBeCloseTo(Math.SQRT2 * LIFT, 6);
    expect(scaleOf(h, "captures")).toBe(1);
  });
});

describe("no-pop rebase when a grab retargets mid-pull", () => {
  it("starts the grabbed widget at its base (× lift), not the ramped delta", () => {
    const h = makeHarness();
    h.setActive("tasks");

    h.send({ type: "pullStart" }); // pull owns the active head (tasks)
    h.send({ type: "pullDelta", delta: 0.5 }); // tasks ramps to 2^0.5
    expect(scaleOf(h, "tasks")).toBeCloseTo(Math.SQRT2, 6);

    // Grab retargets to captures at the live delta: it must NOT pop to 2^0.5.
    h.send({ type: "grabStart", targetId: "captures" });
    expect(scaleOf(h, "captures")).toBeCloseTo(LIFT, 6); // base 1 × lift, no pop

    // Continuing the pull grows captures from its base (delta − offset).
    h.send({ type: "pullDelta", delta: 0.8 });
    expect(scaleOf(h, "captures")).toBeCloseTo(Math.pow(2, 0.3) * LIFT, 6);
  });
});

describe("grabEnd position settle", () => {
  it("clears the override when released on the widget's own slot", () => {
    const h = makeHarness();
    h.send({ type: "grabStart", targetId: "tasks" }); // tasks already on slot 0
    h.send({ type: "grabEnd" });

    expect(getWidgetTransform("tasks").position).toBeNull();
    expect(getWidgetTransform("tasks").scale).toBeNull();
  });

  it("commits the released point when it snaps to nothing (freeform)", () => {
    const h = makeHarness();
    h.place("tasks", [10, 10, 0]); // far from every anchor
    h.send({ type: "grabStart", targetId: "tasks" });
    h.send({ type: "grabEnd" });

    expect(getWidgetTransform("tasks").position).toEqual([10, 10, 0]);
  });
});

describe("reset drops an in-flight session", () => {
  it("makes a subsequent grabEnd a no-op (nothing committed)", () => {
    const h = makeHarness();
    h.place("tasks", [10, 10, 0]);
    h.send({ type: "grabStart", targetId: "tasks" });

    h.controller.reset();
    h.send({ type: "grabEnd" }); // orphaned end → must not commit

    expect(getWidgetTransform("tasks").position).toBeNull();
  });
});
