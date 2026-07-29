"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

/**
 * The cockpit's right slot: one grid track, two possible occupants (SDC-1 §2.2).
 *
 * There are never four live columns. Rail + stage + dock + a detail panel
 * starves the stage to roughly 600px on a 14-inch screen, which is the exact
 * cramped feeling this shell exists to remove. So the Dock and any `SidePanel`
 * share a single track, and this module owns the arbitration between them.
 *
 * Two stores, deliberately split by how often they change:
 *
 *  - **Chrome state** (React state): does a panel own the slot, how wide is it,
 *    is the Dock collapsed, which widgets are docked. These change on user
 *    action, so they can drive a re-render of the grid.
 *  - **The panel registration** (an external store read with
 *    `useSyncExternalStore`): the live `SidePanelProps`, children included.
 *    A `SidePanel` re-registers on every one of its own renders so its children
 *    never go stale, and only `SidePanelHost` subscribes. If this lived in
 *    provider state, every re-registration would re-render the provider, which
 *    would re-render the panel, which would re-register: an infinite loop.
 */

export const DOCK_COLLAPSED_KEY = "cockpit-dock-collapsed";
export const DOCK_WIDGETS_KEY = "cockpit-dock-widgets";

/** Below this the Dock is not rendered at all and a SidePanel degrades to a sheet. */
export const LG_QUERY = "(min-width: 1024px)";
/** Below this the Dock is forced collapsed (derived, never persisted). */
export const XL_QUERY = "(min-width: 1280px)";

export const DOCK_WIDTH_EXPANDED = 280;
export const DOCK_WIDTH_COLLAPSED = 44;
export const PANEL_WIDTH_DEFAULT = 380;
export const PANEL_WIDTH_MIN = 320;
export const PANEL_WIDTH_MAX = 560;

export type SidePanelProps = {
  open: boolean;
  onClose: () => void;
  side?: "right" | "left";
  /** Clamped to 320-560. Defaults to 380. */
  width?: number;
  title?: ReactNode;
  /** Right side of the header. */
  actions?: ReactNode;
  footer?: ReactNode;
  /**
   * Overrides the body box. The default is `flex-1 overflow-y-auto p-4`, which
   * is right for the overwhelming majority of panels. Pass this only when the
   * content owns its own scroll and padding (an embedded console, a board), so
   * the panel does not nest two scroll containers.
   */
  bodyClassName?: string;
  children: ReactNode;
};

export type PanelRegistration = { id: string; props: SidePanelProps };

/** The scalar half of a registration: everything the grid needs to size itself. */
export type PanelChrome = { id: string; width: number; side: "right" | "left" };

export function clampPanelWidth(width: number | undefined): number {
  const raw = width ?? PANEL_WIDTH_DEFAULT;
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, raw));
}

/**
 * The right slot's width, derived rather than stored. Closing a panel restores
 * the Dock to its prior collapse state for free, because `dockCollapsed` was
 * never touched while the panel was open (§2.2.3).
 */
export function computeRightSlotWidth(input: {
  panel: PanelChrome | null;
  /** The Dock is mounted and the viewport is wide enough to render it. */
  dockAvailable: boolean;
  dockCollapsed: boolean;
  /** Viewport is at least 1280px. Below it the Dock is forced collapsed. */
  atLeastXl: boolean;
}): string {
  if (input.panel) return `${input.panel.width}px`;
  if (!input.dockAvailable) return "0px";
  const collapsed = input.dockCollapsed || !input.atLeastXl;
  return `${collapsed ? DOCK_WIDTH_COLLAPSED : DOCK_WIDTH_EXPANDED}px`;
}

/* ----------------------------------------------------- the registration store */

type PanelStore = {
  get: () => PanelRegistration | null;
  set: (registration: PanelRegistration) => void;
  /** Ownership-checked: a panel that has already been replaced cannot clear the replacement. */
  clear: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
};

function createPanelStore(): PanelStore {
  let current: PanelRegistration | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: () => current,
    set: (registration) => {
      current = registration;
      emit();
    },
    clear: (id) => {
      if (current?.id !== id) return;
      current = null;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/* -------------------------------------------------------------- media queries */

/**
 * SSR-safe min-width hook. Defaults to `false` so the server and the first
 * client paint agree, then reads the real value in an effect. Mirrors the
 * pattern in `components/shell/use-sidebar-breakpoint.ts`; reading `matchMedia`
 * during render would break SSR and risk a hydration mismatch.
 */
export function useMinWidth(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

/* ------------------------------------------------------------------- context */

type RightSlotContextValue = {
  /** True once localStorage has been read, so nothing flashes at its default. */
  mounted: boolean;
  atLeastLg: boolean;
  atLeastXl: boolean;

  panelChrome: PanelChrome | null;
  acquireSlot: (chrome: PanelChrome) => void;
  releaseSlot: (id: string) => void;
  panelStore: PanelStore;

  dockCollapsed: boolean;
  setDockCollapsed: (collapsed: boolean) => void;
  /** `null` until hydrated, which means "fall back to each widget's defaultDocked". */
  dockedIds: string[] | null;
  setDockedIds: (ids: string[]) => void;
};

const RightSlotContext = createContext<RightSlotContextValue | null>(null);

export function useRightSlot(): RightSlotContextValue {
  const value = useContext(RightSlotContext);
  if (!value) {
    throw new Error("useRightSlot must be used inside <RightSlotProvider>");
  }
  return value;
}

/** Non-throwing variant, for components that may render outside the cockpit. */
export function useOptionalRightSlot(): RightSlotContextValue | null {
  return useContext(RightSlotContext);
}

export function RightSlotProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [panelChrome, setPanelChrome] = useState<PanelChrome | null>(null);
  const [dockCollapsed, setDockCollapsedState] = useState(false);
  const [dockedIds, setDockedIdsState] = useState<string[] | null>(null);
  const panelStore = useMemo(createPanelStore, []);

  const atLeastLg = useMinWidth(LG_QUERY);
  const atLeastXl = useMinWidth(XL_QUERY);

  useEffect(() => {
    try {
      setDockCollapsedState(window.localStorage.getItem(DOCK_COLLAPSED_KEY) === "true");
      const stored = window.localStorage.getItem(DOCK_WIDGETS_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setDockedIdsState(parsed.filter((id): id is string => typeof id === "string"));
        }
      }
    } catch {
      // A private-mode or quota-blocked localStorage is not a reason to fail the
      // shell; the defaults are correct, they just do not persist.
    }
    setMounted(true);
  }, []);

  const setDockCollapsed = useCallback((collapsed: boolean) => {
    setDockCollapsedState(collapsed);
    try {
      window.localStorage.setItem(DOCK_COLLAPSED_KEY, String(collapsed));
    } catch {
      // see above
    }
  }, []);

  const setDockedIds = useCallback((ids: string[]) => {
    setDockedIdsState(ids);
    try {
      window.localStorage.setItem(DOCK_WIDGETS_KEY, JSON.stringify(ids));
    } catch {
      // see above
    }
  }, []);

  // Last open wins. The releasing panel checks ownership by id so a panel that
  // has already been replaced cannot clobber its replacement on the way out.
  //
  // The equality check matters: a panel re-acquiring with identical chrome must
  // not produce a new state object, or the context value churns and every
  // consumer re-renders for nothing.
  const acquireSlot = useCallback((chrome: PanelChrome) => {
    setPanelChrome((current) =>
      current &&
      current.id === chrome.id &&
      current.width === chrome.width &&
      current.side === chrome.side
        ? current
        : chrome
    );
  }, []);

  const releaseSlot = useCallback((id: string) => {
    setPanelChrome((current) => (current?.id === id ? null : current));
  }, []);

  const value = useMemo<RightSlotContextValue>(
    () => ({
      mounted,
      atLeastLg,
      atLeastXl,
      panelChrome,
      acquireSlot,
      releaseSlot,
      panelStore,
      dockCollapsed,
      setDockCollapsed,
      dockedIds,
      setDockedIds,
    }),
    [
      mounted,
      atLeastLg,
      atLeastXl,
      panelChrome,
      acquireSlot,
      releaseSlot,
      panelStore,
      dockCollapsed,
      setDockCollapsed,
      dockedIds,
      setDockedIds,
    ]
  );

  return <RightSlotContext.Provider value={value}>{children}</RightSlotContext.Provider>;
}

/**
 * `useLayoutEffect` on the client, `useEffect` on the server. The panel writes
 * its registration before paint so the host never renders a frame behind.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Subscribe to the currently registered panel. Only `SidePanelHost` should call
 * this: it is what keeps re-registration from cascading into a render loop.
 */
export function useRegisteredPanel(store: PanelStore): PanelRegistration | null {
  return useSyncExternalStore(store.subscribe, store.get, getServerSnapshot);
}

/** Nothing is registered on the server; a panel only ever opens from a client action. */
function getServerSnapshot(): PanelRegistration | null {
  return null;
}
