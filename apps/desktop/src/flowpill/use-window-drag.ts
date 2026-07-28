import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_CORNER, nearestCorner, persistCorner, inTauri } from "./corner";
import type { FlowPillCorner } from "./types";

/**
 * use-window-drag.ts — drag the overlay by its pill, then snap to a corner.
 *
 * The pill is the only visible thing in a 440x300 transparent window, so
 * dragging the pill means dragging the window. The native drag is started
 * through Tauri's `startDragging`, not by setting the window position on every
 * pointer move: once the drag begins the webview stops receiving pointer events
 * anyway (the window server owns the mouse), so a JS-driven drag would stall on
 * the first frame and jitter for the rest.
 *
 * That has one consequence worth naming. There is no pointerup to snap on,
 * because the pointer never comes back. The settle is therefore detected from
 * the window's own `onMoved` stream going quiet, which is the same signal a
 * release produces and also covers a drag that ends off the pill.
 */

/** Quiet period after the last move that counts as "the user let go". */
const SETTLE_MS = 220;

interface WindowDrag {
  /** Whether a drag is in progress, for the grab cursor. */
  dragging: boolean;
  /** The corner the window is currently parked in. */
  corner: FlowPillCorner;
  /** Attach to the pill's `onPointerDown`. */
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

export function useWindowDrag(
  initialCorner: FlowPillCorner = DEFAULT_CORNER,
): WindowDrag {
  const [dragging, setDragging] = useState(false);
  const [corner, setCorner] = useState<FlowPillCorner>(initialCorner);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setCorner(initialCorner);
  }, [initialCorner]);

  const settle = useCallback(async () => {
    draggingRef.current = false;
    setDragging(false);
    try {
      const { currentMonitor, getCurrentWindow } = await import(
        "@tauri-apps/api/window"
      );
      const appWindow = getCurrentWindow();
      const [position, size, monitor] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
        currentMonitor(),
      ]);
      // No monitor means the window is mid-transition between displays. Leaving
      // the corner alone is strictly better than guessing and teleporting the
      // pill to a screen the user did not drag it to.
      if (!monitor) return;

      // Physical pixels on both sides, so a retina display needs no scaling.
      const next = nearestCorner(
        {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
        },
        {
          x: monitor.position.x,
          y: monitor.position.y,
          width: monitor.size.width,
          height: monitor.size.height,
        },
      );
      setCorner(next);
      await persistCorner(next);
    } catch (error) {
      console.warn("[flowpill] could not snap to a corner", error);
    }
  }, []);

  useEffect(() => {
    if (!inTauri()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const stop = await getCurrentWindow().onMoved(() => {
          if (!draggingRef.current) return;
          if (settleRef.current) clearTimeout(settleRef.current);
          settleRef.current = setTimeout(() => {
            settleRef.current = null;
            void settle();
          }, SETTLE_MS);
        });
        if (cancelled) stop();
        else unlisten = stop;
      } catch (error) {
        console.warn("[flowpill] window move listener unavailable", error);
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [settle]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    // Only the primary button drags, and never from a control: Cancel and Done
    // are the two things the user is most likely to hit in a hurry, and a stray
    // drag instead of a click there would send or discard nothing at all.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (!inTauri()) return;

    draggingRef.current = true;
    setDragging(true);
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
      } catch (error) {
        draggingRef.current = false;
        setDragging(false);
        console.warn("[flowpill] could not start a window drag", error);
      }
    })();
  }, []);

  return { dragging, corner, onPointerDown };
}
