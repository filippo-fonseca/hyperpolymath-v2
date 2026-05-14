"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 5-second undo countdown hook for JARVIS receipts (D-03 / D-04).
 *
 * Phase 5 Plan 05-04 Task 1.
 *
 * Signature:
 *   useUndoCountdown(initialSeconds, onExpire) → { seconds, cancel }
 *
 * Semantics:
 *   - Mounts at `initialSeconds`, ticks down once per second via setInterval.
 *   - When seconds reaches 0, fires `onExpire` exactly once and clears the
 *     interval (so further idle time doesn't re-fire).
 *   - `cancel()` clears the interval immediately and prevents `onExpire` from
 *     firing — used when the user clicks the Undo button mid-countdown.
 *   - Unmount clears the interval (no leak / no late onExpire).
 *
 * Implementation notes:
 *   - `onExpire` is captured in a ref so the interval closure stays stable
 *     even if the parent passes a new function on every render.
 *   - The interval is started in a `useEffect([])` with empty deps so React
 *     Strict Mode's double-mount in development re-runs the cleanup → no
 *     double-counting in dev.
 *   - `seconds === 0` after the final tick stays 0 (never goes negative).
 */
export function useUndoCountdown(
  initialSeconds: number,
  onExpire: () => void,
): { seconds: number; cancel: () => void } {
  const [seconds, setSeconds] = useState(initialSeconds);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Once onExpire has fired (countdown hit 0) OR cancel() was called, we
  // don't want any subsequent setInterval ticks to do anything if for some
  // reason the clearInterval raced.
  const expiredRef = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (expiredRef.current) return s;
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          expiredRef.current = true;
          // Fire onExpire AFTER we've cleared the interval so the consumer
          // can synchronously read the cleared state if they re-mount logic.
          expireRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    expiredRef.current = true;
  }, []);

  return { seconds, cancel };
}
