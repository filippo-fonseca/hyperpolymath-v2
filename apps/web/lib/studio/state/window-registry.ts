"use client";

/**
 * window-registry — the cross-window peer store AND the sync controller for the
 * multi-window studio.
 *
 * The studio can span several same-origin browser windows (one per monitor).
 * This module is the SINGLE owner of everything cross-window:
 *  - a live registry of the open studio windows (self + peers), each with a
 *    monitor `position` (left | center | right), driving the settings pane;
 *  - the `BroadcastChannel` lifecycle: hello/ack join, heartbeat/bye liveness,
 *    position-set, ownership-update, and widget handoff between windows;
 *  - the REMOTE-SYNC writes to `zone-assignment` (join-relinquish, orphan
 *    adoption, handoff receipt). Local gesture writes stay exclusively in the
 *    manipulation controller; this module never touches the DnD channel.
 *
 * Architecture — instance + default singleton. `createWindowRegistry(opts)`
 * builds an isolated instance whose channel, assignment store, self identity, and
 * clock are all injectable. The app uses ONE default instance (module singleton,
 * real `BroadcastChannel`, the real `zone-assignment` store) via the thin wrapper
 * API below. Tests construct several instances that share an in-memory fake
 * channel bus, each with its own assignment port, to simulate real windows
 * without a browser.
 *
 * Single-window purity: with no peers nothing ever mutates ownership, so the
 * default assignment stays the full `INITIAL_ASSIGNMENT` — byte-identical to the
 * pre-multi-window studio.
 */

import { useSyncExternalStore } from "react";

import type { StudioWidgetId } from "@/components/studio/data/useStudioData";
import {
  getZoneAssignment,
  insertWidgetAtZone,
  removeWidget,
  replaceAssignment,
} from "@/lib/studio/state/zone-assignment";
import {
  createStudioSyncChannel,
  type StudioSyncChannel,
  type StudioSyncMessage,
  type StudioWindowPosition,
} from "@/lib/studio/sync/broadcast";

/** Heartbeat cadence (ms). Each window pings this often; peers refresh lastSeen. */
export const HEARTBEAT_MS = 2000;
/** A peer is pruned when unheard-from for longer than this (ms). */
export const PEER_TTL_MS = 5500;

const POS_INDEX: Record<StudioWindowPosition, number> = {
  left: 0,
  center: 1,
  right: 2,
};

/** A window as surfaced to the UI (settings pane). */
export interface StudioWindow {
  id: string;
  label: string;
  position: StudioWindowPosition;
  bornAt: number;
  isSelf: boolean;
}

/** This window's own identity. */
interface SelfRecord {
  id: string;
  bornAt: number;
  label: string;
  position: StudioWindowPosition;
}

/** A peer window as tracked internally (adds liveness + cached owned widgets). */
interface PeerRecord {
  id: string;
  bornAt: number;
  label: string;
  position: StudioWindowPosition;
  lastSeen: number;
  widgets: StudioWidgetId[];
}

/**
 * The assignment operations the registry needs — injectable so a test instance
 * drives its OWN in-memory owned-set while the app instance drives the real
 * `zone-assignment` module store.
 */
export interface AssignmentPort {
  get: () => readonly StudioWidgetId[];
  remove: (id: StudioWidgetId) => void;
  insertAt: (id: StudioWidgetId, zoneIdx: number) => void;
  replace: (next: readonly StudioWidgetId[]) => void;
}

/** The default assignment port: the real module `zone-assignment` store. */
const moduleAssignmentPort: AssignmentPort = {
  get: getZoneAssignment,
  remove: removeWidget,
  insertAt: insertWidgetAtZone,
  replace: replaceAssignment,
};

export interface WindowRegistryOptions {
  /** The sync channel; defaults to the real same-origin `BroadcastChannel`. */
  channel?: StudioSyncChannel;
  /** The owned-widget store; defaults to the module `zone-assignment`. */
  assignment?: AssignmentPort;
  /** Fixed self identity (tests pin `id`/`bornAt` for deterministic ordering). */
  self?: { id: string; bornAt: number; position?: StudioWindowPosition; label?: string };
  /** Clock source; defaults to `Date.now`. Tests inject a controllable clock. */
  clock?: () => number;
  /** Peer time-to-live before prune (ms). Defaults to {@link PEER_TTL_MS}. */
  ttlMs?: number;
}

// ── Pure helpers (direct unit-test targets) ─────────────────────────────────────

/**
 * Split peers into the still-alive and the timed-out (unheard-from for longer
 * than `ttlMs` as of `now`). Pure; the caller acts on `pruned`.
 */
export function prunePeers<T extends { lastSeen: number }>(
  peers: readonly T[],
  now: number,
  ttlMs: number,
): { alive: T[]; pruned: T[] } {
  const alive: T[] = [];
  const pruned: T[] = [];
  for (const p of peers) {
    if (now - p.lastSeen > ttlMs) pruned.push(p);
    else alive.push(p);
  }
  return { alive, pruned };
}

/**
 * Which window in `direction` receives a handoff, from `self`'s vantage. With
 * exactly one peer it is that peer (both directions — the two-window case). With
 * more, order by position (left < center < right) and pick the NEAREST peer
 * strictly in that direction; ties among same-position peers break to the lowest
 * id. None in that direction ⇒ `null` (a normal local drop).
 */
export function resolveHandoffTarget(
  direction: "left" | "right",
  self: { id: string; position: StudioWindowPosition },
  peers: readonly { id: string; position: StudioWindowPosition }[],
): string | null {
  if (peers.length === 0) return null;
  if (peers.length === 1) return peers[0]!.id; // exactly two windows total

  const selfIdx = POS_INDEX[self.position];
  const candidates = peers.filter((p) =>
    direction === "right"
      ? POS_INDEX[p.position] > selfIdx
      : POS_INDEX[p.position] < selfIdx,
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ai = POS_INDEX[a.position];
    const bi = POS_INDEX[b.position];
    if (ai !== bi) return direction === "right" ? ai - bi : bi - ai; // nearest first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // tie → lowest id
  });
  return candidates[0]!.id;
}

/**
 * The deterministic adopter among a set of windows: the oldest `bornAt`, ties
 * broken by lowest id. Used so exactly one surviving window inherits a dead
 * window's orphaned widgets. Returns `null` for an empty set.
 */
export function chooseAdopter(
  windows: readonly { id: string; bornAt: number }[],
): string | null {
  if (windows.length === 0) return null;
  let best = windows[0]!;
  for (const w of windows) {
    if (w.bornAt < best.bornAt || (w.bornAt === best.bornAt && w.id < best.id)) {
      best = w;
    }
  }
  return best.id;
}

// ── Instance ────────────────────────────────────────────────────────────────────

export interface WindowRegistry {
  start: () => void;
  stop: () => void;
  getWindows: () => StudioWindow[];
  getSelf: () => StudioWindow;
  subscribe: (cb: () => void) => () => void;
  setPosition: (id: string, position: StudioWindowPosition) => void;
  resolveHandoffTarget: (direction: "left" | "right") => string | null;
  sendHandoff: (
    widgetId: StudioWidgetId,
    toWindowId: string,
    direction: "left" | "right",
  ) => void;
  /** Emit one heartbeat and prune dead peers. The interval calls this; tests too. */
  heartbeat: () => void;
  /** Test/inspection: the live peer records. */
  getPeers: () => PeerRecord[];
}

export function createWindowRegistry(
  opts: WindowRegistryOptions = {},
): WindowRegistry {
  const clock = opts.clock ?? Date.now;
  const ttlMs = opts.ttlMs ?? PEER_TTL_MS;
  const assignment = opts.assignment ?? moduleAssignmentPort;

  const makeSelf = (): SelfRecord => {
    if (opts.self) {
      return {
        id: opts.self.id,
        bornAt: opts.self.bornAt,
        position: opts.self.position ?? "center",
        label: opts.self.label ?? `Studio ${opts.self.id.slice(0, 4)}`,
      };
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    return { id, bornAt: clock(), position: "center", label: `Studio ${id.slice(0, 4)}` };
  };

  const self = makeSelf();
  const peers = new Map<string, PeerRecord>();

  let channel: StudioSyncChannel | null = opts.channel ?? null;
  let unsubscribeChannel: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  const subscribers = new Set<() => void>();
  let snapshot: StudioWindow[] = [];

  const rebuildSnapshot = (): void => {
    snapshot = [
      { id: self.id, label: self.label, position: self.position, bornAt: self.bornAt, isSelf: true },
      ...[...peers.values()].map((p) => ({
        id: p.id,
        label: p.label,
        position: p.position,
        bornAt: p.bornAt,
        isSelf: false,
      })),
    ];
  };
  rebuildSnapshot();

  const emit = (): void => {
    rebuildSnapshot();
    for (const cb of subscribers) cb();
  };

  const post = (message: StudioSyncMessage): void => channel?.post(message);

  const upsertPeer = (
    id: string,
    fields: Partial<Omit<PeerRecord, "id">>,
  ): PeerRecord => {
    const existing = peers.get(id);
    const next: PeerRecord = existing
      ? { ...existing, ...fields }
      : {
          id,
          bornAt: fields.bornAt ?? clock(),
          label: fields.label ?? `Studio ${id.slice(0, 4)}`,
          position: fields.position ?? "center",
          lastSeen: fields.lastSeen ?? clock(),
          widgets: fields.widgets ?? [],
        };
    peers.set(id, next);
    return next;
  };

  /** A peer left (bye) or timed out (prune): drop it and adopt its orphans. */
  const departPeer = (dead: PeerRecord): void => {
    peers.delete(dead.id);
    const windows = [
      { id: self.id, bornAt: self.bornAt },
      ...[...peers.values()].map((p) => ({ id: p.id, bornAt: p.bornAt })),
    ];
    if (chooseAdopter(windows) === self.id && dead.widgets.length > 0) {
      for (const w of dead.widgets) assignment.insertAt(w, assignment.get().length);
      post({ type: "ownership-update", id: self.id, widgets: [...assignment.get()] });
    }
  };

  const handleMessage = (message: StudioSyncMessage): void => {
    switch (message.type) {
      case "window-hello": {
        upsertPeer(message.id, {
          bornAt: message.bornAt,
          label: message.label,
          position: message.position,
          lastSeen: clock(),
        });
        // Reply so the newcomer learns of us and our owned set (unicast by `to`).
        post({
          type: "window-ack",
          id: self.id,
          bornAt: self.bornAt,
          position: self.position,
          widgets: [...assignment.get()],
          to: message.id,
        });
        emit();
        return;
      }
      case "window-ack": {
        upsertPeer(message.id, {
          bornAt: message.bornAt,
          position: message.position,
          widgets: message.widgets,
          lastSeen: clock(),
        });
        // Only the newcomer this ack addresses runs the relinquish check.
        if (message.to === self.id) {
          const elder =
            message.bornAt < self.bornAt ||
            (message.bornAt === self.bornAt && message.id < self.id);
          if (elder) {
            // An elder exists → I claimed-all on mount; give it all back.
            assignment.replace([]);
            post({ type: "ownership-update", id: self.id, widgets: [] });
          }
        }
        emit();
        return;
      }
      case "window-heartbeat": {
        upsertPeer(message.id, { lastSeen: clock() });
        return;
      }
      case "window-bye": {
        const dead = peers.get(message.id);
        if (dead) {
          departPeer(dead);
          emit();
        }
        return;
      }
      case "position-set": {
        if (message.id === self.id) self.position = message.position;
        else upsertPeer(message.id, { position: message.position, lastSeen: clock() });
        emit();
        return;
      }
      case "ownership-update": {
        upsertPeer(message.id, { widgets: message.widgets, lastSeen: clock() });
        return;
      }
      case "handoff": {
        if (message.toWindowId !== self.id) return;
        // Edge-aware landing: a widget crossing the RIGHT margin enters from this
        // window's LEFT edge → zone 0; crossing the LEFT margin appends (right edge).
        const zone = message.direction === "right" ? 0 : assignment.get().length;
        assignment.insertAt(message.widgetId, zone);
        post({ type: "ownership-update", id: self.id, widgets: [...assignment.get()] });
        return;
      }
    }
  };

  const heartbeat = (): void => {
    post({ type: "window-heartbeat", id: self.id });
    const { pruned } = prunePeers([...peers.values()], clock(), ttlMs);
    if (pruned.length > 0) {
      for (const dead of pruned) departPeer(dead);
      emit();
    }
  };

  const start = (): void => {
    if (started) return;
    started = true;
    if (!channel) channel = opts.channel ?? createStudioSyncChannel();
    unsubscribeChannel = channel.subscribe(handleMessage);
    // Claim-all on mount is implicit (the assignment seeds full); announce self.
    post({
      type: "window-hello",
      id: self.id,
      bornAt: self.bornAt,
      label: self.label,
      position: self.position,
    });
    if (typeof setInterval !== "undefined") {
      heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
    }
  };

  const stop = (): void => {
    if (!started) return;
    started = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    post({ type: "window-bye", id: self.id });
    unsubscribeChannel?.();
    unsubscribeChannel = null;
    channel?.close();
    channel = null;
    peers.clear();
    emit();
  };

  const setPosition = (id: string, position: StudioWindowPosition): void => {
    if (id === self.id) self.position = position;
    else upsertPeer(id, { position, lastSeen: clock() });
    post({ type: "position-set", id, position });
    emit();
  };

  const resolveTarget = (direction: "left" | "right"): string | null =>
    resolveHandoffTarget(
      direction,
      { id: self.id, position: self.position },
      [...peers.values()].map((p) => ({ id: p.id, position: p.position })),
    );

  const sendHandoff = (
    widgetId: StudioWidgetId,
    toWindowId: string,
    direction: "left" | "right",
  ): void => {
    post({ type: "handoff", widgetId, toWindowId, fromWindowId: self.id, direction });
    assignment.remove(widgetId);
    // Optimistically credit the target so a prune-adoption recovers the widget
    // if the target dies before its own ownership-update lands.
    const target = peers.get(toWindowId);
    if (target && !target.widgets.includes(widgetId)) {
      target.widgets = [...target.widgets, widgetId];
    }
    post({ type: "ownership-update", id: self.id, widgets: [...assignment.get()] });
  };

  return {
    start,
    stop,
    getWindows: () => snapshot,
    // snapshot[0] is always this window (rebuildSnapshot puts self first), so it
    // stays referentially stable between emits — required by useSyncExternalStore.
    getSelf: () => snapshot[0]!,
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    setPosition,
    resolveHandoffTarget: resolveTarget,
    sendHandoff,
    heartbeat,
    getPeers: () => [...peers.values()],
  };
}

// ── Default app instance + module-singleton wrappers ────────────────────────────

let defaultRegistry: WindowRegistry | null = null;

/** The app's single registry, created lazily (client-only self identity). */
function getDefaultRegistry(): WindowRegistry {
  if (!defaultRegistry) defaultRegistry = createWindowRegistry();
  return defaultRegistry;
}

const SSR_SELF: StudioWindow = Object.freeze({
  id: "",
  label: "This window",
  position: "center",
  bornAt: 0,
  isSelf: true,
});
const SSR_WINDOWS: StudioWindow[] = Object.freeze([SSR_SELF]) as StudioWindow[];

/**
 * Start the app's cross-window registry. Returns a stop function (wire it as a
 * `useEffect` cleanup). Idempotent per instance.
 */
export function startWindowRegistry(): () => void {
  const reg = getDefaultRegistry();
  reg.start();
  return () => reg.stop();
}

export function getStudioWindows(): StudioWindow[] {
  return getDefaultRegistry().getWindows();
}

export function getSelfWindow(): StudioWindow {
  return getDefaultRegistry().getSelf();
}

export function setWindowPosition(id: string, position: StudioWindowPosition): void {
  getDefaultRegistry().setPosition(id, position);
}

export function resolveDefaultHandoffTarget(
  direction: "left" | "right",
): string | null {
  return getDefaultRegistry().resolveHandoffTarget(direction);
}

export function sendHandoff(
  widgetId: StudioWidgetId,
  toWindowId: string,
  direction: "left" | "right",
): void {
  getDefaultRegistry().sendHandoff(widgetId, toWindowId, direction);
}

/** React hook — re-renders when the open-windows set changes. */
export function useStudioWindows(): StudioWindow[] {
  return useSyncExternalStore(
    (cb) => getDefaultRegistry().subscribe(cb),
    getStudioWindows,
    () => SSR_WINDOWS,
  );
}

/** React hook — re-renders when this window's own record changes. */
export function useSelfWindow(): StudioWindow {
  return useSyncExternalStore(
    (cb) => getDefaultRegistry().subscribe(cb),
    getSelfWindow,
    () => SSR_SELF,
  );
}

/** Test-only reset of the module default instance. */
export function __resetWindowRegistry(): void {
  if (defaultRegistry) defaultRegistry.stop();
  defaultRegistry = null;
}
