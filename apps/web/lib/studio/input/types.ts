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

export type StudioIntentType = "expand" | "collapse" | "swipeLeft" | "swipeRight" | "halt";

/**
 * What consumers receive on the intent bus. `expand` always carries the
 * hovered target the hub injected; a targetless `expand` is never delivered.
 * `halt` is a deliberate one-shot (a ~1s open-palm hold) — targetless, used by
 * the kill-switch downstream; it passes through the hub unchanged.
 */
export type StudioIntent =
  | { type: "expand"; targetId: string }
  | { type: "collapse" }
  | { type: "swipeLeft" }
  | { type: "swipeRight" }
  | { type: "halt" };

/**
 * Continuous interaction phases, delivered on a separate bus from discrete
 * {@link StudioIntent}s so a 30fps stream never re-runs intent consumers. Three
 * families: `grab*` (a pinch that began over a widget — carries the target),
 * `drag*` (a free pinch drag vector, cumulative from drag start), and `pull*`
 * (a normalized, clamped resize scalar, cumulative from pull start). The three
 * `grab*` variants keep their originally-reserved shapes byte-identical.
 */
export type StudioPhaseEvent =
  | { type: "grabStart"; targetId: string }
  | { type: "grabMove"; nx: number; ny: number }
  | { type: "grabEnd" }
  | { type: "dragStart" }
  | { type: "dragMove"; dx: number; dy: number; dz: number }
  | { type: "dragEnd" }
  | { type: "pullStart" }
  | { type: "pullDelta"; delta: number }
  | { type: "pullEnd" };

/**
 * What drivers are allowed to emit on the phase bus. Drivers never resolve
 * hover, so `grabStart` carries no target — the hub upgrades it from the
 * current hover (and drops the whole grab lifecycle when there is none), exactly
 * as it upgrades `expand`. Everything else passes through unchanged.
 */
export type StudioPhaseInput =
  | { type: "grabStart" }
  | Exclude<StudioPhaseEvent, { type: "grabStart" }>;

/**
 * What drivers are allowed to emit. Drivers never resolve hover, so `expand`
 * carries no target — the hub upgrades it from the current hover.
 */
export type StudioIntentInput =
  | { type: "expand" }
  | { type: "collapse" }
  | { type: "swipeLeft" }
  | { type: "swipeRight" }
  | { type: "halt" };

// ---- Hover providers (THE seam for 3D + DOM) -------------------------------

export type HoverProvider = {
  id: string;
  /** Higher wins. Suggested: 3D raycast = 10, DOM rects = 0. */
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
  /** Continuous grab/drag/pull phases. Hub injects the grab target. */
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
  /** Continuous-phase subscription (grab/drag/pull streams). Zero re-render. */
  subscribePhase(cb: (phase: StudioPhaseEvent) => void): () => void;
  registerHoverProvider(p: HoverProvider): () => void;
  /** Registers and starts a driver; the returned fn stops + unregisters it. */
  registerDriver(d: StudioInputDriver): () => void;
}
