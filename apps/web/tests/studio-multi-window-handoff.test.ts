import { describe, expect, it } from "vitest";

import {
  createFakeChannelFactory,
  createStudioSyncChannel,
  STUDIO_SYNC_CHANNEL,
} from "@/lib/studio/sync/broadcast";
import {
  createWindowRegistry,
  resolveHandoffTarget,
  type AssignmentPort,
  type WindowRegistry,
} from "@/lib/studio/state/window-registry";
import {
  insertWidgetIntoAssignment,
  removeWidgetFromAssignment,
} from "@/lib/studio/state/zone-assignment";
import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";

function memPort(initial: readonly StudioWidgetId[]): AssignmentPort & {
  snapshot: () => StudioWidgetId[];
} {
  let widgets: readonly StudioWidgetId[] = [...initial];
  return {
    get: () => widgets,
    remove: (id) => {
      widgets = removeWidgetFromAssignment(widgets, id);
    },
    insertAt: (id, idx) => {
      widgets = insertWidgetIntoAssignment(widgets, id, idx);
    },
    replace: (next) => {
      widgets = [...next];
    },
    snapshot: () => [...widgets],
  };
}

function scene() {
  const factory = createFakeChannelFactory();
  const clock = (): number => 1000;
  const open = (opts: {
    id: string;
    bornAt: number;
    position?: "left" | "center" | "right";
    widgets: readonly StudioWidgetId[];
  }) => {
    const port = memPort(opts.widgets);
    const reg = createWindowRegistry({
      channel: createStudioSyncChannel(STUDIO_SYNC_CHANNEL, factory),
      assignment: port,
      self: { id: opts.id, bornAt: opts.bornAt, position: opts.position },
      clock,
    });
    return { reg, port };
  };
  return { open };
}

const [W0, W1] = STUDIO_WIDGET_ORDER;

describe("resolveHandoffTarget — direction → receiver (pure)", () => {
  const self = { id: "self", position: "center" as const };

  it("returns null with no peers (single window is inert)", () => {
    expect(resolveHandoffTarget("left", self, [])).toBeNull();
    expect(resolveHandoffTarget("right", self, [])).toBeNull();
  });

  it("routes to the sole peer in either direction (the two-window case)", () => {
    const peers = [{ id: "peer", position: "left" as const }];
    expect(resolveHandoffTarget("left", self, peers)).toBe("peer");
    expect(resolveHandoffTarget("right", self, peers)).toBe("peer");
  });

  it("picks the nearest peer strictly in the crossed direction", () => {
    const peers = [
      { id: "L", position: "left" as const },
      { id: "R", position: "right" as const },
    ];
    expect(resolveHandoffTarget("right", self, peers)).toBe("R");
    expect(resolveHandoffTarget("left", self, peers)).toBe("L");
  });

  it("returns null when no peer sits in the crossed direction", () => {
    const rightSelf = { id: "self", position: "right" as const };
    const peers = [
      { id: "L", position: "left" as const },
      { id: "C", position: "center" as const },
    ];
    expect(resolveHandoffTarget("right", rightSelf, peers)).toBeNull();
  });

  it("breaks a same-position tie by lowest id", () => {
    const peers = [
      { id: "r2", position: "right" as const },
      { id: "r1", position: "right" as const },
    ];
    expect(resolveHandoffTarget("right", self, peers)).toBe("r1");
  });
});

describe("edge hand-off — full cross-window flow", () => {
  it("lands a right-crossed widget at the receiver's zone 0 (its left edge)", () => {
    const s = scene();
    const a = s.open({
      id: "a",
      bornAt: 1000,
      position: "center",
      widgets: [...STUDIO_WIDGET_ORDER],
    });
    const b = s.open({ id: "b", bornAt: 1001, position: "right", widgets: [] });
    a.reg.start();
    b.reg.start(); // b relinquishes on join → owns []

    // One peer to the right → resolves to b for a right-margin release.
    expect(a.reg.resolveHandoffTarget("right")).toBe("b");

    a.reg.sendHandoff(W0!, "b", "right");
    expect(b.port.snapshot()).toEqual([W0]); // entered at zone 0
    expect(a.port.snapshot()).not.toContain(W0); // left the sender
  });

  it("appends a left-crossed widget at the receiver's far edge", () => {
    const s = scene();
    const a = s.open({
      id: "a",
      bornAt: 1000,
      position: "center",
      widgets: [...STUDIO_WIDGET_ORDER],
    });
    // b already owns one widget so an append is observable (index length, not 0).
    const b = s.open({ id: "b", bornAt: 1001, position: "left", widgets: [] });
    a.reg.start();
    b.reg.start();

    a.reg.sendHandoff(W0!, "b", "right"); // seed b with W0 at zone 0
    a.reg.sendHandoff(W1!, "b", "left"); // left-cross → append after W0
    expect(b.port.snapshot()).toEqual([W0, W1]);
  });
});

describe("single-window purity", () => {
  it("resolves no target and never mutates ownership when alone", () => {
    const s = scene();
    const a = s.open({
      id: "a",
      bornAt: 1000,
      position: "center",
      widgets: [...STUDIO_WIDGET_ORDER],
    });
    a.reg.start();

    expect(a.reg.resolveHandoffTarget("left")).toBeNull();
    expect(a.reg.resolveHandoffTarget("right")).toBeNull();
    expect(a.port.snapshot()).toEqual([...STUDIO_WIDGET_ORDER]); // untouched
  });
});
