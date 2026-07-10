import { describe, expect, it } from "vitest";

import {
  createFakeChannelFactory,
  createStudioSyncChannel,
  STUDIO_SYNC_CHANNEL,
} from "@/lib/studio/sync/broadcast";
import {
  chooseAdopter,
  createWindowRegistry,
  PEER_TTL_MS,
  prunePeers,
  type AssignmentPort,
  type StudioWindow,
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

/**
 * An in-memory {@link AssignmentPort} that reflows exactly like the real
 * zone-assignment store (same pure insert/remove helpers), so each simulated
 * window drives its own owned set without the module singleton.
 */
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

/**
 * A scene of same-origin windows on one shared in-memory channel bus and one
 * shared, advanceable clock — the browser-less analogue of several monitors.
 */
function scene() {
  const factory = createFakeChannelFactory();
  let now = 1000;
  const clock = (): number => now;

  interface Win {
    reg: WindowRegistry;
    port: ReturnType<typeof memPort>;
  }

  const open = (opts: {
    id: string;
    bornAt: number;
    position?: "left" | "center" | "right";
    label?: string;
    widgets: readonly StudioWidgetId[];
  }): Win => {
    const port = memPort(opts.widgets);
    const reg = createWindowRegistry({
      channel: createStudioSyncChannel(STUDIO_SYNC_CHANNEL, factory),
      assignment: port,
      self: {
        id: opts.id,
        bornAt: opts.bornAt,
        position: opts.position,
        label: opts.label,
      },
      clock,
    });
    return { reg, port };
  };

  return {
    open,
    advance: (ms: number) => {
      now += ms;
    },
    at: (t: number) => {
      now = t;
    },
    now: () => now,
  };
}

const peerIds = (reg: WindowRegistry): string[] =>
  reg.getPeers().map((p) => p.id).sort();

const findWindow = (reg: WindowRegistry, id: string): StudioWindow | undefined =>
  reg.getWindows().find((w) => w.id === id);

const [W0, W1] = STUDIO_WIDGET_ORDER;

describe("prunePeers — liveness split", () => {
  it("keeps peers heard-from within ttl and drops the rest", () => {
    const peers = [
      { id: "a", lastSeen: 100 },
      { id: "b", lastSeen: 900 },
    ];
    const { alive, pruned } = prunePeers(peers, 1000, 500);
    expect(alive.map((p) => p.id)).toEqual(["b"]); // 1000-900=100 ≤ 500
    expect(pruned.map((p) => p.id)).toEqual(["a"]); // 1000-100=900 > 500
  });
});

describe("chooseAdopter — deterministic single inheritor", () => {
  it("picks the oldest bornAt, breaking ties by lowest id", () => {
    expect(
      chooseAdopter([
        { id: "z", bornAt: 5 },
        { id: "a", bornAt: 5 },
        { id: "m", bornAt: 3 },
      ]),
    ).toBe("m"); // oldest
    expect(
      chooseAdopter([
        { id: "z", bornAt: 5 },
        { id: "a", bornAt: 5 },
      ]),
    ).toBe("a"); // tie → lowest id
    expect(chooseAdopter([])).toBeNull();
  });
});

describe("join — hello/ack + claim-all/relinquish-to-elder", () => {
  it("each window sees the other as a peer after both start", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [...STUDIO_WIDGET_ORDER] });
    a.reg.start();
    b.reg.start();

    expect(peerIds(a.reg)).toEqual(["b"]);
    expect(peerIds(b.reg)).toEqual(["a"]);
  });

  it("the younger window relinquishes its whole set to the elder on join", () => {
    const s = scene();
    // Both seed the full set (claim-all on mount). `a` is elder (earlier bornAt).
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [...STUDIO_WIDGET_ORDER] });
    a.reg.start();
    b.reg.start();

    expect(b.port.snapshot()).toEqual([]); // younger gave it all back
    expect(a.port.snapshot()).toEqual([...STUDIO_WIDGET_ORDER]); // elder keeps it
    // The elder caches the newcomer's now-empty ownership.
    expect(a.reg.getPeers().find((p) => p.id === "b")?.widgets).toEqual([]);
  });

  it("converges three joining windows onto the eldest as the sole owner", () => {
    const s = scene();
    // Every window claims the full set on mount (bornAt monotonic with open
    // order — a later window is always younger). Each newcomer relinquishes on
    // seeing an elder, so ownership collapses onto the first-born.
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [...STUDIO_WIDGET_ORDER] });
    const c = s.open({ id: "c", bornAt: 1002, widgets: [...STUDIO_WIDGET_ORDER] });
    a.reg.start();
    b.reg.start();
    c.reg.start();

    expect(a.port.snapshot()).toEqual([...STUDIO_WIDGET_ORDER]); // eldest keeps all
    expect(b.port.snapshot()).toEqual([]);
    expect(c.port.snapshot()).toEqual([]);
  });
});

describe("heartbeat — keep-alive vs. prune", () => {
  it("prunes a peer that goes silent past the ttl", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [] });
    a.reg.start();
    b.reg.start();
    expect(peerIds(a.reg)).toEqual(["b"]);

    // `b` never pings again; `a` sweeps after the ttl elapses.
    s.advance(PEER_TTL_MS + 1);
    a.reg.heartbeat();
    expect(peerIds(a.reg)).toEqual([]); // b pruned
  });

  it("keeps a peer alive when it heartbeats within the ttl", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [] });
    a.reg.start();
    b.reg.start();

    s.advance(PEER_TTL_MS - 100);
    b.reg.heartbeat(); // refreshes b.lastSeen inside a's map
    s.advance(200); // total elapsed since b's ping = 200 < ttl
    a.reg.heartbeat();
    expect(peerIds(a.reg)).toEqual(["b"]); // still alive
  });
});

describe("position — last-write-wins across windows", () => {
  it("propagates a self position change to a peer's cache", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, position: "center", widgets: [] });
    const b = s.open({ id: "b", bornAt: 1001, position: "center", widgets: [] });
    a.reg.start();
    b.reg.start();

    a.reg.setPosition("a", "left");
    expect(a.reg.getSelf().position).toBe("left");
    expect(findWindow(b.reg, "a")?.position).toBe("left"); // peer converged
  });
});

describe("departure — bye drops the peer and one window adopts its orphans", () => {
  it("the surviving window re-homes a closed window's widgets", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [] });
    a.reg.start();
    b.reg.start();

    // Hand W0 to b so it owns something, then close b.
    a.reg.sendHandoff(W0!, "b", "right");
    expect(b.port.snapshot()).toEqual([W0]);
    expect(a.port.snapshot()).not.toContain(W0);

    b.reg.stop(); // posts bye
    expect(peerIds(a.reg)).toEqual([]); // b gone
    expect(a.port.snapshot()).toContain(W0); // a adopted the orphan
  });

  it("exactly one window (the oldest) adopts when several survive", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [] });
    const c = s.open({ id: "c", bornAt: 1002, widgets: [] });
    a.reg.start();
    b.reg.start();
    c.reg.start();

    // Give c a widget (broadcasts ownership-update → both a and b cache it).
    a.reg.sendHandoff(W1!, "c", "right");
    expect(c.port.snapshot()).toEqual([W1]);

    c.reg.stop(); // both a and b see the bye
    // Oldest survivor is `a`: it adopts; `b` declines.
    expect(a.port.snapshot()).toContain(W1);
    expect(b.port.snapshot()).not.toContain(W1);
  });

  it("optimistically credits the target so an immediate close still recovers", () => {
    const s = scene();
    const a = s.open({ id: "a", bornAt: 1000, widgets: [...STUDIO_WIDGET_ORDER] });
    const b = s.open({ id: "b", bornAt: 1001, widgets: [] });
    a.reg.start();
    b.reg.start();

    a.reg.sendHandoff(W0!, "b", "right");
    // a's cache of b already includes the handed widget (optimistic credit).
    expect(a.reg.getPeers().find((p) => p.id === "b")?.widgets).toContain(W0);
  });
});
