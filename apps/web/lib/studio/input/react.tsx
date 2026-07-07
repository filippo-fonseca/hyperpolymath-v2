"use client";

/**
 * React bindings for the Studio input core.
 *
 * Perf-critical decision: cursor moves at 60fps must NOT re-render the tree.
 * The context carries only the stable hub instance; granular subscriptions use
 * `useSyncExternalStore` so a component re-renders only when the specific slice
 * it reads actually changes.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import { StudioInputHub } from "./hub";
import { MouseKeyboardDriver } from "./drivers/mouse-keyboard";
import { StudioDebugCursor } from "./debug-cursor";
import type {
  HoverProvider,
  StudioCursor,
  StudioInputBus,
  StudioInputDriver,
  StudioStageRect,
} from "./types";

const StudioInputContext = createContext<StudioInputHub | null>(null);

function readStageRect(stageRef?: RefObject<HTMLElement | null>): StudioStageRect {
  const el = stageRef?.current;
  if (el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  if (typeof window !== "undefined") {
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return { left: 0, top: 0, width: 0, height: 0 };
}

export type StudioInputProviderProps = {
  children: ReactNode;
  /** Anchors cursor coordinates; defaults to the viewport. */
  stageRef?: RefObject<HTMLElement | null>;
  /** Drivers to register on mount. Defaults to `[new MouseKeyboardDriver()]`. */
  drivers?: StudioInputDriver[];
  /** Render the DOM debug cursor. Also enabled via `?studioDebug=1`. */
  debug?: boolean;
};

export function StudioInputProvider({
  children,
  stageRef,
  drivers,
  debug,
}: StudioInputProviderProps): React.JSX.Element {
  // Keep the latest stageRef readable from the hub without re-creating the hub.
  const stageRefBox = useRef(stageRef);
  stageRefBox.current = stageRef;

  const hub = useMemo(
    () => new StudioInputHub({ getStageRect: () => readStageRect(stageRefBox.current) }),
    [],
  );

  // Register drivers on mount; stop them on unmount. `drivers` is intentionally
  // read once (a stable default is created per provider instance).
  const driversRef = useRef(drivers);
  useEffect(() => {
    const list = driversRef.current ?? [new MouseKeyboardDriver()];
    const unregs = list.map((d) => hub.registerDriver(d));
    return () => {
      for (const u of unregs) u();
    };
  }, [hub]);

  const debugEnabled =
    debug ??
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("studioDebug") === "1");

  return (
    <StudioInputContext.Provider value={hub}>
      {children}
      {debugEnabled ? <StudioDebugCursor /> : null}
    </StudioInputContext.Provider>
  );
}

function useHub(): StudioInputHub {
  const hub = useContext(StudioInputContext);
  if (!hub) {
    throw new Error("useStudioInput must be used within a <StudioInputProvider>");
  }
  return hub;
}

/** The raw bus, for advanced consumers (e.g. imperative registration). */
export function useStudioInput(): StudioInputBus {
  return useHub();
}

/**
 * Re-renders on every cursor change. Intended for cursor-visual overlays only
 * (the debug cursor and the production hand reticle) — never for tree-wide state.
 */
export function useStudioCursor(): StudioCursor {
  const hub = useHub();
  return useSyncExternalStore(
    (cb) => hub.subscribe(cb),
    () => hub.getSnapshot().cursor,
    () => hub.getSnapshot().cursor,
  );
}

/** Re-renders when the resolved hover target changes. */
export function useStudioHover(): string | null {
  const hub = useHub();
  return useSyncExternalStore(
    (cb) => hub.subscribe(cb),
    () => hub.getSnapshot().hoverTargetId,
    () => hub.getSnapshot().hoverTargetId,
  );
}

/** Re-renders only when THIS id's hovered state flips. */
export function useStudioIsHovered(id: string): boolean {
  const hub = useHub();
  return useSyncExternalStore(
    (cb) => hub.subscribe(cb),
    () => hub.getSnapshot().hoverTargetId === id,
    () => hub.getSnapshot().hoverTargetId === id,
  );
}

/** Effect-based intent subscription — zero re-renders. */
export function useStudioIntent(cb: (intent: import("./types").StudioIntent) => void): void {
  const hub = useHub();
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => hub.subscribeIntent((i) => cbRef.current(i)), [hub]);
}

/** Registers a DOM rect in the built-in hover provider for `id`. */
export function useStudioDomTarget(id: string, ref: RefObject<HTMLElement | null>): void {
  const hub = useHub();
  useEffect(() => {
    const unreg = hub.registerDomTarget(id, () => {
      const el = ref.current;
      // A detached ref should never match: return an empty, off-screen rect.
      if (!el) return new DOMRect(-1, -1, 0, 0);
      return el.getBoundingClientRect();
    });
    return unreg;
    // `ref` is a stable object; `id`/`hub` drive re-registration.
  }, [hub, id, ref]);
}

/** The 3D seam — register a custom hover provider (e.g. a raycast). */
export function useStudioHoverProvider(provider: HoverProvider): void {
  const hub = useHub();
  const providerRef = useRef(provider);
  providerRef.current = provider;
  useEffect(() => {
    // Wrap so the latest provider fn is always used without re-registering.
    const stable: HoverProvider = {
      id: provider.id,
      priority: provider.priority,
      resolve: (cursor) => providerRef.current.resolve(cursor),
    };
    return hub.registerHoverProvider(stable);
  }, [hub, provider.id, provider.priority]);
}

// Re-export the debug cursor so consumers can place it explicitly if desired.
export { StudioDebugCursor };
