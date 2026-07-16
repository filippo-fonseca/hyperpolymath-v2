/**
 * StudioInputHub — the framework-free heart of the input core.
 *
 * Implements {@link StudioInputBus} (what React consumers see) and exposes the
 * {@link StudioInputSink} it hands to drivers. It owns three things:
 *  1. cursor state (clamped, with derived px),
 *  2. hover resolution across registered {@link HoverProvider}s, and
 *  3. the intent bus (upgrading targetless driver intents using current hover).
 *
 * It has no React and no DOM dependency at construction, so it is unit-testable
 * without jsdom. Pass `{ sync: true }` in tests to resolve hover synchronously
 * (no requestAnimationFrame timing to mock).
 */

import type {
  HoverProvider,
  StudioCursor,
  StudioDriverEnv,
  StudioInputBus,
  StudioInputDriver,
  StudioInputSink,
  StudioInputSnapshot,
  StudioIntent,
  StudioIntentInput,
  StudioPhaseEvent,
  StudioPhaseInput,
  StudioStageRect,
} from "./types";
import { HOVER_PRIORITY } from "./types";
import { clamp01 } from "./clamp";

export type StudioInputHubOptions = {
  /** Reads the current stage rect (viewport coords). Defaults to a 0×0 rect. */
  getStageRect?: () => StudioStageRect;
  /** Injectable window-ish target for drivers; passed through in the driver env. */
  eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** Resolve hover synchronously instead of coalescing via rAF (tests). */
  sync?: boolean;
};

const ZERO_RECT: StudioStageRect = { left: 0, top: 0, width: 0, height: 0 };

const rafSchedule: (cb: () => void) => void =
  typeof requestAnimationFrame === "function"
    ? (cb) => {
        requestAnimationFrame(cb);
      }
    : (cb) => {
        // Environments without rAF (SSR / node) fall back to a microtask.
        Promise.resolve().then(cb);
      };

export class StudioInputHub implements StudioInputBus {
  private readonly getStageRect: () => StudioStageRect;
  private readonly eventTarget: Pick<Window, "addEventListener" | "removeEventListener">;
  private readonly sync: boolean;

  private snapshot: StudioInputSnapshot = {
    cursor: { x: 0, y: 0, nx: 0, ny: 0, active: false },
    hoverTargetId: null,
  };

  private readonly storeSubs = new Set<() => void>();
  private readonly intentSubs = new Set<(intent: StudioIntent) => void>();
  private readonly phaseSubs = new Set<(phase: StudioPhaseEvent) => void>();
  private readonly providers = new Set<HoverProvider>();

  /**
   * When a `grabStart` is dropped for lack of a hover target, its orphaned
   * `grabMove`/`grabEnd` must be dropped too (a grab lifecycle with no delivered
   * start is a contract violation). Cleared on `grabEnd` or the next `grabStart`.
   */
  private grabSuppressed = false;

  /**
   * Symmetric to {@link grabSuppressed} for the free-drag (camera-nav) lifecycle.
   * A pinch that begins with a widget under the reticle must never pan the camera
   * — it is a bloom (quick release) or a grab (hold), both widget-scoped. So on a
   * `dragStart` with a non-null hover we suppress the whole `dragMove`/`dragEnd`
   * lifecycle. Cleared on `dragEnd` or the next `dragStart`. Pinches over empty
   * space (no hover) navigate normally.
   */
  private dragSuppressed = false;

  /**
   * Symmetric to {@link grabSuppressed} for the open-hand resize lifecycle: a
   * `resizeStart` with no widget under the reticle is dropped along with its
   * `resizeMove`/`resizeEnd`. Cleared on `resizeEnd` or the next `resizeStart`.
   */
  private resizeSuppressed = false;

  /**
   * Symmetric to {@link grabSuppressed} for the index-scroll lifecycle: a
   * `scrollStart` over empty space is dropped along with its
   * `scrollMove`/`scrollEnd`. Cleared on `scrollEnd` or the next `scrollStart`.
   */
  private scrollSuppressed = false;

  /** Built-in rect-based DOM hover provider (HOVER_PRIORITY.domRects — the floor). */
  private readonly domRects = new Map<string, () => DOMRect>();

  private hoverScheduled = false;

  constructor(options: StudioInputHubOptions = {}) {
    this.getStageRect = options.getStageRect ?? (() => ZERO_RECT);
    this.eventTarget =
      options.eventTarget ??
      (typeof window !== "undefined"
        ? window
        : { addEventListener() {}, removeEventListener() {} });
    this.sync = options.sync ?? false;

    this.registerHoverProvider(this.buildDomProvider());
  }

  // ---- StudioInputBus ------------------------------------------------------

  getSnapshot(): StudioInputSnapshot {
    return this.snapshot;
  }

  subscribe(cb: () => void): () => void {
    this.storeSubs.add(cb);
    return () => {
      this.storeSubs.delete(cb);
    };
  }

  subscribeIntent(cb: (intent: StudioIntent) => void): () => void {
    this.intentSubs.add(cb);
    return () => {
      this.intentSubs.delete(cb);
    };
  }

  subscribePhase(cb: (phase: StudioPhaseEvent) => void): () => void {
    this.phaseSubs.add(cb);
    return () => {
      this.phaseSubs.delete(cb);
    };
  }

  registerHoverProvider(p: HoverProvider): () => void {
    this.providers.add(p);
    this.scheduleHoverResolve();
    return () => {
      this.providers.delete(p);
      this.scheduleHoverResolve();
    };
  }

  registerDriver(d: StudioInputDriver): () => void {
    const env: StudioDriverEnv = {
      getStageRect: this.getStageRect,
      eventTarget: this.eventTarget,
    };
    d.start(this.sink, env);
    return () => {
      d.stop();
    };
  }

  // ---- Sink handed to drivers ---------------------------------------------

  readonly sink: StudioInputSink = {
    moveCursor: (nx, ny) => this.moveCursor(nx, ny),
    setCursorActive: (active) => this.setCursorActive(active),
    emitIntent: (intent) => this.emitIntent(intent),
    emitPhase: (phase) => this.emitPhase(phase),
  };

  // ---- DOM hover provider (used by useStudioDomTarget) --------------------

  /** Registers a rect getter for `id`. Returns an unregister fn. */
  registerDomTarget(id: string, getRect: () => DOMRect): () => void {
    this.domRects.set(id, getRect);
    this.scheduleHoverResolve();
    return () => {
      this.domRects.delete(id);
      this.scheduleHoverResolve();
    };
  }

  private buildDomProvider(): HoverProvider {
    return {
      id: "dom-rects",
      priority: HOVER_PRIORITY.domRects,
      resolve: (cursor) => {
        if (!cursor.active) return null;
        const rect = this.getStageRect();
        // Cursor px is stage-relative; convert to viewport coords to hit-test
        // against getBoundingClientRect() (which is viewport-relative).
        const vx = cursor.x + rect.left;
        const vy = cursor.y + rect.top;
        for (const [id, getRect] of this.domRects) {
          const r = getRect();
          if (vx >= r.left && vx <= r.right && vy >= r.top && vy <= r.bottom) {
            return id;
          }
        }
        return null;
      },
    };
  }

  // ---- Cursor + hover ------------------------------------------------------

  private moveCursor(nx: number, ny: number): void {
    const cnx = clamp01(nx);
    const cny = clamp01(ny);
    const rect = this.getStageRect();
    const x = cnx * rect.width;
    const y = cny * rect.height;

    const prev = this.snapshot.cursor;
    if (
      prev.nx === cnx &&
      prev.ny === cny &&
      prev.x === x &&
      prev.y === y &&
      prev.active
    ) {
      return; // no change; keep snapshot identity stable
    }

    const cursor: StudioCursor = { x, y, nx: cnx, ny: cny, active: true };
    this.snapshot = { ...this.snapshot, cursor };
    this.notifyStore();
    this.scheduleHoverResolve();
  }

  private setCursorActive(active: boolean): void {
    if (this.snapshot.cursor.active === active) return;
    const cursor: StudioCursor = { ...this.snapshot.cursor, active };
    this.snapshot = { ...this.snapshot, cursor };
    this.notifyStore();
    this.scheduleHoverResolve();
  }

  private scheduleHoverResolve(): void {
    if (this.sync) {
      this.resolveHover();
      return;
    }
    if (this.hoverScheduled) return;
    this.hoverScheduled = true;
    rafSchedule(() => {
      this.hoverScheduled = false;
      this.resolveHover();
    });
  }

  private resolveHover(): void {
    const cursor = this.snapshot.cursor;
    let next: string | null = null;

    if (cursor.active) {
      // Highest priority provider that returns non-null wins.
      const sorted = [...this.providers].sort((a, b) => b.priority - a.priority);
      for (const p of sorted) {
        const id = p.resolve(cursor);
        if (id !== null) {
          next = id;
          break;
        }
      }
    }

    if (next === this.snapshot.hoverTargetId) return;
    this.snapshot = { ...this.snapshot, hoverTargetId: next };
    this.notifyStore();
  }

  // ---- Intent bus ----------------------------------------------------------

  private emitIntent(input: StudioIntentInput): void {
    let intent: StudioIntent;
    if (input.type === "expand" || input.type === "tap") {
      // Both clicks upgrade from the current hover; a targetless one is dropped
      // (a tap/bloom off any hittable is intentionally inert — nothing to press).
      const targetId = this.snapshot.hoverTargetId;
      if (targetId === null) return;
      intent = { type: input.type, targetId };
    } else {
      // collapse / swipe / halt / confirmApprove / confirmCancel pass through
      // untouched: none is hover-scoped (the confirm gate decides whether an
      // approve/cancel has a pending send to answer).
      intent = input;
    }
    for (const cb of this.intentSubs) cb(intent);
  }

  /**
   * Upgrades a targetless `grabStart` with the current hover target (mirroring
   * `emitIntent`'s expand upgrade). A grabStart with no hover is dropped, and its
   * whole orphaned lifecycle (`grabMove`/`grabEnd`) is suppressed with it.
   * Symmetrically, a `dragStart` that lands with a widget under the reticle
   * suppresses its whole `dragMove`/`dragEnd` lifecycle (pinch-over-card is never
   * a camera pan). Drags begun over empty space pass through unchanged.
   */
  private emitPhase(input: StudioPhaseInput): void {
    let event: StudioPhaseEvent;
    if (input.type === "grabStart") {
      const targetId = this.snapshot.hoverTargetId;
      if (targetId === null) {
        this.grabSuppressed = true; // drop this grab's whole lifecycle
        return;
      }
      this.grabSuppressed = false;
      event = { type: "grabStart", targetId };
    } else if (input.type === "grabMove" || input.type === "grabEnd") {
      if (this.grabSuppressed) {
        if (input.type === "grabEnd") this.grabSuppressed = false;
        return; // orphaned lifecycle from a dropped grabStart
      }
      event = input;
    } else if (input.type === "dragStart") {
      if (this.snapshot.hoverTargetId !== null) {
        this.dragSuppressed = true; // a pinch begun over a card never pans
        return;
      }
      this.dragSuppressed = false;
      event = input;
    } else if (input.type === "dragMove" || input.type === "dragEnd") {
      if (this.dragSuppressed) {
        if (input.type === "dragEnd") this.dragSuppressed = false;
        return; // suppressed drag lifecycle (pinch began over a card)
      }
      event = input;
    } else if (input.type === "resizeStart") {
      const targetId = this.snapshot.hoverTargetId;
      if (targetId === null) {
        this.resizeSuppressed = true; // resize with no widget under the reticle
        return;
      }
      this.resizeSuppressed = false;
      event = { type: "resizeStart", targetId };
    } else if (input.type === "resizeMove" || input.type === "resizeEnd") {
      if (this.resizeSuppressed) {
        if (input.type === "resizeEnd") this.resizeSuppressed = false;
        return; // orphaned lifecycle from a dropped resizeStart
      }
      event = input;
    } else if (input.type === "scrollStart") {
      const targetId = this.snapshot.hoverTargetId;
      if (targetId === null) {
        this.scrollSuppressed = true; // scroll over empty space
        return;
      }
      this.scrollSuppressed = false;
      event = { type: "scrollStart", targetId };
    } else if (input.type === "scrollMove" || input.type === "scrollEnd") {
      if (this.scrollSuppressed) {
        if (input.type === "scrollEnd") this.scrollSuppressed = false;
        return; // orphaned lifecycle from a dropped scrollStart
      }
      event = input;
    } else {
      event = input;
    }
    for (const cb of this.phaseSubs) cb(event);
  }

  // ---- Notification --------------------------------------------------------

  private notifyStore(): void {
    for (const cb of this.storeSubs) cb();
  }
}
