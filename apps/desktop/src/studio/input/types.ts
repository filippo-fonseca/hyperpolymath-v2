/**
 * studio-input-core — the shared input contract.
 *
 * This module is framework-free (no React, no DOM globals at module scope) so
 * it can be unit-tested without jsdom. It defines the typed event/state model
 * that every Studio input driver and consumer agrees on: a cursor, a resolved
 * hover target, and a small set of discrete intents.
 *
 * Design invariants:
 * - Drivers emit cursor moves + *targetless* intents only. They never resolve
 *   hover (a webcam has no idea what is under the cursor; only the 3D scene can
 *   raycast). The hub resolves hover via pluggable {@link HoverProvider}s.
 * - Cursor coordinates are stage-relative, not viewport-relative, so
 *   camera-normalized hand output and mouse output share one space.
 */

// ---- Cursor ----------------------------------------------------------------

export type StudioCursor = {
  /** Stage-relative pixels. */
  x: number;
  y: number;
  /** Normalized 0..1 within the stage. */
  nx: number;
  ny: number;
  /** False when there is no pointing source (mouse left stage / hand lost). */
  active: boolean;
};

// ---- Intents ---------------------------------------------------------------

export type StudioIntentType =
  | "expand"
  | "tap"
  | "collapse"
  | "swipeLeft"
  | "swipeRight"
  | "halt"
  | "confirmApprove"
  | "confirmCancel";

/**
 * What consumers receive on the intent bus. `expand` and `tap` both always carry
 * the hovered target the hub injected; a targetless one is never delivered. `tap`
 * is the primary hand click (a palm close-then-open); `expand` is the
 * legacy pinch-bloom click, kept alongside it. `halt` is a deliberate one-shot (a
 * ~1s open-palm hold) — targetless, used by the kill-switch downstream; it passes
 * through the hub unchanged. `confirmApprove`/`confirmCancel` are the thumbs-up /
 * thumbs-down confirm-gate answers — targetless one-shots, delivered as-is (the
 * confirm gate, not the hub, decides whether a pending send exists to answer).
 */
export type StudioIntent =
  | { type: "expand"; targetId: string }
  | { type: "tap"; targetId: string }
  | { type: "collapse" }
  | { type: "swipeLeft" }
  | { type: "swipeRight" }
  | { type: "halt" }
  | { type: "confirmApprove" }
  | { type: "confirmCancel" };

/**
 * Continuous interaction phases, delivered on a separate bus from discrete
 * {@link StudioIntent}s so a 30fps stream never re-runs intent consumers. Two
 * families: `grab*` (a pinch that began over a widget — carries the target and
 * drives drag-and-drop into a zone), and `drag*` (a free pinch drag vector,
 * cumulative from drag start, driving 3D camera navigation). The three `grab*`
 * variants keep their originally-reserved shapes byte-identical.
 */
export type StudioPhaseEvent =
  | { type: "grabStart"; targetId: string }
  | { type: "grabMove"; nx: number; ny: number }
  | { type: "grabEnd" }
  | { type: "dragStart" }
  | { type: "dragMove"; dx: number; dy: number; dz: number }
  | { type: "dragEnd" }
  // Open-hand resize (widget-scoped). Like `grab*`, `resizeStart` carries the
  // hovered widget the hub injected; `resizeMove` streams a cumulative scale
  // multiplier from the arm baseline (1.0 = unchanged), `resizeEnd` terminates.
  | { type: "resizeStart"; targetId: string }
  | { type: "resizeMove"; scale: number }
  | { type: "resizeEnd" }
  // Index-finger scroll (surface-scoped). `scrollStart` carries the hovered
  // surface the hub injected; `scrollMove` streams an incremental vertical
  // wheel delta (`dy`, px-ish, positive = content moves up / scroll down),
  // `scrollEnd` terminates.
  | { type: "scrollStart"; targetId: string }
  | { type: "scrollMove"; dy: number }
  | { type: "scrollEnd" };

/**
 * What drivers are allowed to emit on the phase bus. Drivers never resolve
 * hover, so `grabStart`/`resizeStart`/`scrollStart` carry no target — the hub
 * upgrades each from the current hover (and drops the whole lifecycle when
 * there is none), exactly as it upgrades `expand`. Everything else passes
 * through unchanged.
 */
export type StudioPhaseInput =
  | { type: "grabStart" }
  | { type: "resizeStart" }
  | { type: "scrollStart" }
  | Exclude<
      StudioPhaseEvent,
      { type: "grabStart" } | { type: "resizeStart" } | { type: "scrollStart" }
    >;

/**
 * What drivers are allowed to emit. Drivers never resolve hover, so `expand`
 * carries no target — the hub upgrades it from the current hover.
 */
export type StudioIntentInput =
  | { type: "expand" }
  | { type: "tap" }
  | { type: "collapse" }
  | { type: "swipeLeft" }
  | { type: "swipeRight" }
  | { type: "halt" }
  | { type: "confirmApprove" }
  | { type: "confirmCancel" };

// ---- Hover providers (THE seam for 3D + DOM) -------------------------------

/**
 * The hover-provider priority ladder. Higher wins; the hub sorts descending and
 * takes the first non-null resolve, so ties resolve by sort stability — which is
 * exactly the bug this exists to prevent. Register with one of these rather than
 * a bare literal.
 *
 * The doc previously suggested "3D raycast = 10, DOM rects = 0" while
 * pointer-synth's DOM hit-test registered at 10 (the raycast slot). Harmless
 * only because no raycast provider has landed yet. These constants describe the
 * ladder as it is actually built, and leave `raycast` a slot of its own above
 * both DOM providers.
 */
export const HOVER_PRIORITY = {
  /** 3D scene raycast. Reserved — no provider registers here yet. */
  raycast: 20,
  /** Live DOM hit-test under the reticle (pointer-synth). Beats the rect registry. */
  domHitTest: 10,
  /** The hub's built-in stage-rect registry. The floor: a fallback for everything. */
  domRects: 0,
} as const;

export type HoverProvider = {
  id: string;
  /** Higher wins. Use a {@link HOVER_PRIORITY} rung, not a bare literal. */
  priority: number;
  /**
   * Return the hovered target id, or null. Called on every cursor move
   * (rAF-coalesced by the hub).
   */
  resolve(cursor: StudioCursor): string | null;
};

// ---- Driver interface ------------------------------------------------------

export type StudioStageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StudioDriverEnv = {
  /** Current stage rect in viewport coords, for px→normalized conversion. */
  getStageRect(): StudioStageRect;
  /** Window-ish event target for listeners; injectable for tests. */
  eventTarget: Pick<Window, "addEventListener" | "removeEventListener">;
};

export type StudioInputSink = {
  /** Normalized stage coords (0..1). Hub clamps + derives px. */
  moveCursor(nx: number, ny: number): void;
  setCursorActive(active: boolean): void;
  emitIntent(intent: StudioIntentInput): void;
  /** Continuous grab/drag phases. Hub injects the grab target. */
  emitPhase(phase: StudioPhaseInput): void;
};

export interface StudioInputDriver {
  readonly id: string; // "mouse-keyboard" | "hand" | ...
  start(sink: StudioInputSink, env: StudioDriverEnv): void;
  stop(): void;
}

// ---- Hub public surface (what the React context carries) -------------------

export type StudioInputSnapshot = {
  cursor: StudioCursor;
  hoverTargetId: string | null;
};

export interface StudioInputBus {
  getSnapshot(): StudioInputSnapshot;
  /** Store-change subscription (fires when cursor OR hover changes). */
  subscribe(cb: () => void): () => void;
  subscribeIntent(cb: (intent: StudioIntent) => void): () => void;
  /** Continuous-phase subscription (grab/drag streams). Zero re-render. */
  subscribePhase(cb: (phase: StudioPhaseEvent) => void): () => void;
  registerHoverProvider(p: HoverProvider): () => void;
  /** Registers and starts a driver; the returned fn stops + unregisters it. */
  registerDriver(d: StudioInputDriver): () => void;
}
