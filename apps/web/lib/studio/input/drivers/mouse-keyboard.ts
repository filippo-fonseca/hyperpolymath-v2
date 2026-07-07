/**
 * MouseKeyboardDriver — drives the entire Studio dashboard with no camera.
 *
 * It converts pointer + keyboard events into the driver-facing contract: cursor
 * moves (stage-normalized) and targetless discrete intents. Hover resolution is
 * the hub's job; this driver never touches it. Swipe detection is delegated to
 * the shared {@link createSwipeRecognizer}, engaged on Shift+left-button-drag.
 */

import { createSwipeRecognizer, type SwipeRecognizer } from "../swipe-recognizer";
import type { StudioDriverEnv, StudioInputDriver, StudioInputSink } from "../types";

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
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
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
    if (this.dragging) {
      this.dragging = false;
      this.swipe?.push({ t: e.timeStamp, nx: 0, ny: 0, engaged: false });
    }
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
  }

  stop(): void {
    if (this.env) {
      const t = this.env.eventTarget;
      t.removeEventListener("pointermove", this.onPointerMove as EventListener);
      t.removeEventListener("pointerdown", this.onPointerDown as EventListener);
      t.removeEventListener("pointerup", this.onPointerUp as EventListener);
      t.removeEventListener("click", this.onClick as EventListener);
      t.removeEventListener("keydown", this.onKeyDown as EventListener);
    }
    this.sink = null;
    this.env = null;
    this.swipe = null;
  }
}
