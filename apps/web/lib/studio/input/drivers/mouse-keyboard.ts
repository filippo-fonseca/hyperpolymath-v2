/**
 * MouseKeyboardDriver — drives the entire Studio dashboard with no camera.
 *
 * It converts pointer + keyboard events into the driver-facing contract: cursor
 * moves (stage-normalized) and targetless discrete intents. Hover resolution is
 * the hub's job; this driver never touches it. Swipe detection is delegated to
 * the shared {@link createSwipeRecognizer}, engaged on Shift+left-button-drag.
 *
 * Camera-traversal emulation (no webcam): Alt+left-drag streams the U0 drag phase
 * bus — `dragStart` on press, cumulative `dragMove{dx,dy,dz}` on move, `dragEnd`
 * on release — and Alt+wheel accumulates the `dz` (dolly) component. This lets
 * `<CameraRig>` be exercised in a browser (and by Playwright / bgsd-verify)
 * without hand tracking. It never forks the phase contract: the shapes are
 * exactly what the pinch recognizer emits.
 */

import { createSwipeRecognizer, type SwipeRecognizer } from "../swipe-recognizer";
import type { StudioDriverEnv, StudioInputDriver, StudioInputSink } from "../types";

/** Wheel-delta → cumulative `dz` scale (gentle; direction is what matters). */
const WHEEL_TO_DZ = 0.0015;

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
};

export class MouseKeyboardDriver implements StudioInputDriver {
  readonly id = "mouse-keyboard";

  private sink: StudioInputSink | null = null;
  private env: StudioDriverEnv | null = null;
  private swipe: SwipeRecognizer | null = null;

  /** Whether the cursor is currently within the stage rect. */
  private inStage = false;
  /** True while a Shift+left-button drag is in progress. */
  private dragging = false;
  /** Latched when a swipe fires mid-drag so the trailing click is suppressed. */
  private swipeFired = false;

  /** True while an Alt+left-button camera drag is in progress. */
  private camDragging = false;
  /** Whether the current camera drag actually moved (gates click suppression). */
  private camMoved = false;
  /** Drag-origin (stage-normalized) so `dragMove` deltas are cumulative. */
  private camOriginNx = 0;
  private camOriginNy = 0;
  /** Last stage-normalized cursor, so a wheel-only dolly can re-emit dx/dy. */
  private camLastNx = 0;
  private camLastNy = 0;
  /** Cumulative dolly component, accumulated from Alt+wheel during the drag. */
  private camDz = 0;

  private emitCamDragMove(): void {
    this.sink?.emitPhase({
      type: "dragMove",
      dx: this.camLastNx - this.camOriginNx,
      dy: this.camLastNy - this.camOriginNy,
      dz: this.camDz,
    });
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.sink || !this.env) return;
    const rect = this.env.getStageRect();
    const nx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const ny = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;

    const inside = nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;
    if (inside) {
      if (!this.inStage) {
        this.inStage = true;
        this.sink.setCursorActive(true);
      }
      this.sink.moveCursor(nx, ny);
    } else if (this.inStage) {
      this.inStage = false;
      this.sink.setCursorActive(false);
    }

    // Feed the swipe recognizer while a Shift-drag is engaged.
    this.swipe?.push({ t: e.timeStamp, nx, ny, engaged: this.dragging });

    // Stream cumulative drag phases while an Alt-drag camera pan is engaged.
    if (this.camDragging) {
      this.camLastNx = nx;
      this.camLastNy = ny;
      this.camMoved = true;
      this.emitCamDragMove();
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // Alt takes precedence: Alt+left starts a camera drag (never a swipe).
    if (e.altKey) {
      const rect = this.env?.getStageRect();
      const nx = rect && rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
      const ny = rect && rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
      this.camDragging = true;
      this.camMoved = false;
      this.camOriginNx = nx;
      this.camOriginNy = ny;
      this.camLastNx = nx;
      this.camLastNy = ny;
      this.camDz = 0;
      this.sink?.emitPhase({ type: "dragStart" });
      return;
    }
    if (e.shiftKey) {
      this.dragging = true;
      this.swipeFired = false;
      const rect = this.env?.getStageRect();
      if (rect && this.swipe) {
        const nx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
        const ny = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
        this.swipe.push({ t: e.timeStamp, nx, ny, engaged: true });
      }
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.camDragging) {
      this.camDragging = false;
      // Swallow the click that terminates a REAL manipulation only; a no-op
      // Alt+click leaves no latch behind to swallow an unrelated later click.
      if (this.camMoved) this.swipeFired = true;
      this.sink?.emitPhase({ type: "dragEnd" });
    }
    if (this.dragging) {
      this.dragging = false;
      this.swipe?.push({ t: e.timeStamp, nx: 0, ny: 0, engaged: false });
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.camDragging) return;
    // Scroll up (deltaY < 0) ⇒ dolly IN ⇒ dz > 0.
    this.camDz += -e.deltaY * WHEEL_TO_DZ;
    this.camMoved = true; // a dolly is a real manipulation too
    if (e.cancelable) e.preventDefault();
    this.emitCamDragMove();
  };

  private readonly onClick = (e: MouseEvent): void => {
    if (!this.sink) return;
    // Suppress the click that terminates a swipe-drag, and any Shift+click.
    if (this.swipeFired) {
      this.swipeFired = false;
      return;
    }
    if (e.shiftKey) return;
    this.sink.emitIntent({ type: "expand" });
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.sink) return;
    if (isEditableTarget(e.target)) return;

    switch (e.key) {
      case "Enter":
      case " ":
      case "Spacebar": // legacy key name
        this.sink.emitIntent({ type: "expand" });
        break;
      case "Escape":
        this.sink.emitIntent({ type: "collapse" });
        break;
      case "ArrowLeft":
        this.sink.emitIntent({ type: "swipeLeft" });
        break;
      case "ArrowRight":
        this.sink.emitIntent({ type: "swipeRight" });
        break;
      default:
        break;
    }
  };

  start(sink: StudioInputSink, env: StudioDriverEnv): void {
    this.sink = sink;
    this.env = env;
    this.inStage = false;
    this.dragging = false;
    this.swipeFired = false;
    this.camDragging = false;
    this.camDz = 0;
    this.swipe = createSwipeRecognizer((dir) => {
      this.swipeFired = true;
      sink.emitIntent({ type: dir });
    });

    const t = env.eventTarget;
    t.addEventListener("pointermove", this.onPointerMove as EventListener);
    t.addEventListener("pointerdown", this.onPointerDown as EventListener);
    t.addEventListener("pointerup", this.onPointerUp as EventListener);
    t.addEventListener("click", this.onClick as EventListener);
    t.addEventListener("keydown", this.onKeyDown as EventListener);
    t.addEventListener("wheel", this.onWheel as EventListener, {
      passive: false,
    });
  }

  stop(): void {
    if (this.env) {
      const t = this.env.eventTarget;
      t.removeEventListener("pointermove", this.onPointerMove as EventListener);
      t.removeEventListener("pointerdown", this.onPointerDown as EventListener);
      t.removeEventListener("pointerup", this.onPointerUp as EventListener);
      t.removeEventListener("click", this.onClick as EventListener);
      t.removeEventListener("keydown", this.onKeyDown as EventListener);
      t.removeEventListener("wheel", this.onWheel as EventListener);
    }
    this.sink = null;
    this.env = null;
    this.swipe = null;
    this.camDragging = false;
  }
}
