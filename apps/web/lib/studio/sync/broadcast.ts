/**
 * broadcast.ts — a thin, typed wrapper over the same-origin `BroadcastChannel`
 * that carries the studio's cross-window sync traffic.
 *
 * The studio can span multiple same-origin browser windows (one per monitor).
 * Every window opens ONE channel of the same name and exchanges a small typed
 * message union: hello/ack for joining, heartbeat/bye for liveness, position-set
 * for the settings pane, ownership-update for the per-window widget partition,
 * and handoff for edge drag-and-drop between windows.
 *
 * Two deliberate properties:
 *  - SSR-safe: if `BroadcastChannel` is undefined (server render, or a jsdom test
 *    with no injected factory) the wrapper returns an inert no-op channel, so
 *    every consumer degrades to single-window behavior with zero branching at the
 *    call site.
 *  - Injectable: `createStudioSyncChannel(name, factory)` accepts a channel
 *    factory so tests fan messages through an in-memory emitter (mimicking the
 *    spec's no-self-delivery) without touching any global.
 *
 * The real `BroadcastChannel` never delivers a message back to the posting
 * context, so consumers need no self-echo filtering; `fromWindowId` on `handoff`
 * exists only for traceability.
 */

import type { StudioWidgetId } from "@/components/studio/data/useStudioData";

/** Where a studio window sits across the user's monitors. Extensible. */
export type StudioWindowPosition = "left" | "center" | "right";

/** A new window announcing itself to any existing peers. */
export interface WindowHelloMessage {
  type: "window-hello";
  id: string;
  bornAt: number;
  label: string;
  position: StudioWindowPosition;
}

/** An existing peer's reply to a hello — carries `to` so only the newcomer acts. */
export interface WindowAckMessage {
  type: "window-ack";
  id: string;
  bornAt: number;
  position: StudioWindowPosition;
  widgets: StudioWidgetId[];
  to: string;
}

/** Liveness ping, sent on the heartbeat interval. */
export interface WindowHeartbeatMessage {
  type: "window-heartbeat";
  id: string;
}

/** A window leaving (tab close / navigation), sent on `pagehide`. */
export interface WindowByeMessage {
  type: "window-bye";
  id: string;
}

/** The settings pane changed some window's monitor position. LWW across peers. */
export interface PositionSetMessage {
  type: "position-set";
  id: string;
  position: StudioWindowPosition;
}

/** A window broadcasting its current owned-widget set. LWW in peer caches. */
export interface OwnershipUpdateMessage {
  type: "ownership-update";
  id: string;
  widgets: StudioWidgetId[];
}

/** An edge drag handing a widget to the window in a given direction. */
export interface HandoffMessage {
  type: "handoff";
  widgetId: StudioWidgetId;
  toWindowId: string;
  fromWindowId: string;
  /** The margin the widget crossed: it enters the receiver from the opposite edge. */
  direction: "left" | "right";
}

/** The full cross-window message union. */
export type StudioSyncMessage =
  | WindowHelloMessage
  | WindowAckMessage
  | WindowHeartbeatMessage
  | WindowByeMessage
  | PositionSetMessage
  | OwnershipUpdateMessage
  | HandoffMessage;

/** The typed channel surface every consumer talks to. */
export interface StudioSyncChannel {
  /** Post a message to every OTHER window on this channel. */
  post: (message: StudioSyncMessage) => void;
  /** Subscribe to inbound messages; returns an unsubscribe. */
  subscribe: (cb: (message: StudioSyncMessage) => void) => () => void;
  /** Tear the channel down. */
  close: () => void;
}

/**
 * The minimal `BroadcastChannel` surface we depend on — lets a test inject a
 * fake without pulling in the DOM lib types.
 */
export interface BroadcastChannelLike {
  postMessage: (data: unknown) => void;
  addEventListener: (
    type: "message",
    listener: (event: { data: unknown }) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: { data: unknown }) => void,
  ) => void;
  close: () => void;
}

/** Factory producing a channel by name — the seam tests replace. */
export type BroadcastChannelFactory = (name: string) => BroadcastChannelLike;

/** Canonical channel name for the studio's cross-window traffic. */
export const STUDIO_SYNC_CHANNEL = "hpv2-studio-sync";

/** An inert channel: swallows posts, delivers nothing. Used on SSR / no-BC envs. */
const INERT_CHANNEL: StudioSyncChannel = {
  post: () => {},
  subscribe: () => () => {},
  close: () => {},
};

/**
 * Open a typed studio sync channel. Falls back to an inert no-op when no
 * `BroadcastChannel` is available and no factory is injected — single-window
 * behavior, no call-site branching.
 */
export function createStudioSyncChannel(
  channelName: string = STUDIO_SYNC_CHANNEL,
  factory?: BroadcastChannelFactory,
): StudioSyncChannel {
  const make: BroadcastChannelFactory | null =
    factory ??
    (typeof BroadcastChannel !== "undefined"
      ? (name: string) => new BroadcastChannel(name) as BroadcastChannelLike
      : null);

  if (!make) return INERT_CHANNEL;

  const bc = make(channelName);
  const listeners = new Set<(message: StudioSyncMessage) => void>();

  const onMessage = (event: { data: unknown }): void => {
    const message = event.data as StudioSyncMessage;
    for (const cb of listeners) cb(message);
  };
  bc.addEventListener("message", onMessage);

  return {
    post: (message) => bc.postMessage(message),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    close: () => {
      bc.removeEventListener("message", onMessage);
      listeners.clear();
      bc.close();
    },
  };
}

/**
 * Test helper: an in-memory `BroadcastChannel` factory. All channels created by
 * one factory share a bus; a post fans out to every OTHER channel on the same
 * name (never the poster), mirroring the real spec's no-self-delivery. Not part
 * of the production path — importing it is a test-only affordance.
 */
export function createFakeChannelFactory(): BroadcastChannelFactory {
  const buses = new Map<string, Set<{ deliver: (data: unknown) => void }>>();

  return (name: string): BroadcastChannelLike => {
    const peers = buses.get(name) ?? new Set();
    buses.set(name, peers);

    const listeners = new Set<(event: { data: unknown }) => void>();
    const self = {
      deliver: (data: unknown) => {
        for (const l of listeners) l({ data });
      },
    };
    peers.add(self);

    return {
      postMessage: (data: unknown) => {
        for (const peer of peers) {
          if (peer !== self) peer.deliver(data); // no self-delivery
        }
      },
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
      close: () => {
        listeners.clear();
        peers.delete(self);
      },
    };
  };
}
