import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  __resetWidgetTransforms,
  getWidgetTransform,
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

  const controller = createManipulationController({
    slots: SLOTS,
    widgetIds: IDS,
    getGroup: (id) => groups.get(id) ?? null,
    camera,
    invalidate,
  });

  return {
    controller,
    groups,
    invalidate,
    place: (id, p) => {
      groups.get(id)!.position.set(p[0], p[1], p[2]);
    },
    send: (phase) => controller.handlePhase(phase),
  };
}

const posOf = (h: Harness, id: StudioWidgetId): THREE.Vector3 =>
  h.groups.get(id)!.position;

beforeEach(() => {
  __resetWidgetTransforms();
});

describe("grab lift (visual, stripped on commit)", () => {
  it("raises the grabbed card by LIFT on +Y and removes it on settle", () => {
    const h = makeHarness();
    expect(posOf(h, "tasks").y).toBe(0);

    h.send({ type: "grabStart", targetId: "tasks" });
    expect(posOf(h, "tasks").y).toBeCloseTo(LIFT, 10); // lifted while grabbed

    h.send({ type: "grabEnd" });
    expect(posOf(h, "tasks").y).toBeCloseTo(0, 10); // settled back onto the slot
    expect(getWidgetTransform("tasks").position).toBeNull(); // own slot → no override
  });

  it("never writes a scale — the group scale stays uniform through a grab", () => {
    const h = makeHarness();
    h.send({ type: "grabStart", targetId: "tasks" });
    expect(h.groups.get("tasks")!.scale.x).toBe(1);
    h.send({ type: "grabEnd" });
    expect(h.groups.get("tasks")!.scale.x).toBe(1);
  });
});

describe("grabEnd position settle", () => {
  it("clears the override when released on the widget's own slot", () => {
    const h = makeHarness();
    h.send({ type: "grabStart", targetId: "tasks" }); // tasks already on slot 0
    h.send({ type: "grabEnd" });

    expect(getWidgetTransform("tasks").position).toBeNull();
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
