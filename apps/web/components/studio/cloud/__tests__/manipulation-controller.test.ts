import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  __resetZoneAssignment,
  getDndState,
  getZoneAssignment,
} from "@/lib/studio/state/zone-assignment";
import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";
import type { StudioPhaseEvent } from "@/lib/studio/input/types";
import { LIFT } from "../manipulation-math";
import {
  createManipulationController,
  type ManipulationController,
} from "../manipulation-controller";
import type { TileSlot } from "../layout";

// Eight zone slots on the X axis, spaced 3 apart, one per widget id. Wide
// spacing makes the nearest-zone test deterministic: a card released near a
// slot's X lands unambiguously in that zone.
const SLOTS: TileSlot[] = STUDIO_WIDGET_ORDER.map((_, i) => ({
  position: [i * 3, 0, 0] as [number, number, number],
}));
const IDS: readonly StudioWidgetId[] = STUDIO_WIDGET_ORDER;

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
  __resetZoneAssignment();
});

describe("grab lift (visual pickup, handed to the damp on drop)", () => {
  it("raises the grabbed card by LIFT on +Y while held", () => {
    const h = makeHarness();
    expect(posOf(h, "tasks").y).toBe(0);

    h.send({ type: "grabStart", targetId: "tasks" });
    expect(posOf(h, "tasks").y).toBeCloseTo(LIFT, 10); // lifted while grabbed

    // grabEnd commits the reflow (none here — own slot) but no longer writes the
    // resting position: the tile damp owns the glide home (stripping the lift as
    // it eases to the slot), so the controller leaves the release point as-is.
    h.send({ type: "grabEnd" });
    expect(getZoneAssignment()).toEqual([...STUDIO_WIDGET_ORDER]); // no move
  });

  it("never writes a scale — the group scale stays uniform through a grab", () => {
    const h = makeHarness();
    h.send({ type: "grabStart", targetId: "tasks" });
    expect(h.groups.get("tasks")!.scale.x).toBe(1);
    h.send({ type: "grabEnd" });
    expect(h.groups.get("tasks")!.scale.x).toBe(1);
  });
});

describe("drop into the nearest zone with full-board reflow", () => {
  it("shifts the intervening cards back when a card moves forward", () => {
    const h = makeHarness();
    h.place("tasks", [6, 0, 0]); // over zone-2's slot
    h.send({ type: "grabStart", targetId: "tasks" });
    h.send({ type: "grabEnd" });

    expect(getZoneAssignment()).toEqual([
      "captures",
      "agenda",
      "tasks",
      "habits",
      "journal",
      "projects",
      "areas",
      "people",
    ]);
    // Single-owner landing: the controller commits the reflow but hands the glide
    // to the tile damp, leaving the dropped group at its (lifted) release point
    // rather than snapping it to the slot center. WidgetTile's damp glides it home.
    expect(posOf(h, "tasks").toArray()).toEqual([6, LIFT, 0]);
  });

  it("shifts the intervening cards forward when a card moves backward", () => {
    const h = makeHarness();
    h.place("people", [6, 0, 0]); // people (zone 7) dragged over zone 2
    h.send({ type: "grabStart", targetId: "people" });
    h.send({ type: "grabEnd" });

    expect(getZoneAssignment()).toEqual([
      "tasks",
      "captures",
      "people",
      "agenda",
      "habits",
      "journal",
      "projects",
      "areas",
    ]);
  });

  it("is a no-op when the card is released on its own zone", () => {
    const h = makeHarness();
    h.send({ type: "grabStart", targetId: "agenda" }); // agenda sits on zone 2
    h.send({ type: "grabEnd" });
    expect(getZoneAssignment()).toEqual([...STUDIO_WIDGET_ORDER]);
  });
});

describe("DnD state transitions", () => {
  it("sets the grabbed id + start zone on grabStart and clears to idle on grabEnd", () => {
    const h = makeHarness();
    expect(getDndState()).toEqual({ grabbedId: null, nearestZone: null });

    h.send({ type: "grabStart", targetId: "agenda" }); // agenda on zone 2
    expect(getDndState()).toEqual({ grabbedId: "agenda", nearestZone: 2 });

    h.send({ type: "grabEnd" });
    expect(getDndState()).toEqual({ grabbedId: null, nearestZone: null });
  });

  it("keeps publishing a valid zone as the card is dragged", () => {
    const h = makeHarness();
    h.send({ type: "grabStart", targetId: "tasks" });
    h.send({ type: "grabMove", nx: 0.5, ny: 0.5 }); // anchor (no jump)
    h.send({ type: "grabMove", nx: 0.7, ny: 0.5 }); // real move

    const dnd = getDndState();
    expect(dnd.grabbedId).toBe("tasks");
    expect(typeof dnd.nearestZone).toBe("number");
    expect(dnd.nearestZone).toBeGreaterThanOrEqual(0);
    expect(dnd.nearestZone).toBeLessThan(SLOTS.length);
  });
});

describe("reset drops an in-flight session", () => {
  it("commits nothing on a subsequent grabEnd and clears the DnD highlight", () => {
    const h = makeHarness();
    h.place("tasks", [6, 0, 0]);
    h.send({ type: "grabStart", targetId: "tasks" });
    expect(getDndState().grabbedId).toBe("tasks");

    h.controller.reset();
    expect(getDndState()).toEqual({ grabbedId: null, nearestZone: null });

    h.send({ type: "grabEnd" }); // orphaned end → must not reflow
    expect(getZoneAssignment()).toEqual([...STUDIO_WIDGET_ORDER]);
  });
});
