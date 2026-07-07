"use client";

/**
 * useHandControl — the state machine + wiring behind the Studio's hand-control
 * consent flow (Wave 4).
 *
 * It owns three things: the persisted opt-in preference (localStorage), the live
 * {@link HandDriverStatus} surfaced by the driver's `onStatusChange`, and the
 * registration lifecycle against the input bus.
 *
 * CAMERA GATE (load-bearing): a `HandTrackingDriver` is the ONLY thing that
 * touches `getUserMedia`, and it is constructed exclusively inside `register()`,
 * which runs only on an explicit `enable()`/`retry()` or a persisted `"on"`
 * opt-in on mount. Nothing here constructs a driver at render time, so the camera
 * prompt is structurally impossible before the user opts in.
 *
 * The driver is injected via `createDriver` (defaulting to `new
 * HandTrackingDriver(opts)`) so the whole flow is testable with a fake driver —
 * no real camera / MediaPipe is reachable in jsdom.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  HandTrackingDriver,
  type HandDriverStatus,
} from "@/lib/studio/input/drivers/hand";
import { useStudioInput } from "@/lib/studio/input/react";
import type { StudioInputDriver } from "@/lib/studio/input/types";

/** localStorage key holding the persisted opt-in ("on" | "off"). */
export const HAND_CONTROL_PREF_KEY = "studio:hand-control";

export type HandControlPref = "on" | "off";

/** Factory seam: builds the driver wired to a status callback. */
export type CreateDriver = (opts: {
  onStatusChange: (status: HandDriverStatus) => void;
}) => StudioInputDriver;

/** Production factory — constructs the real (inert until `start()`) driver. */
export const defaultCreateDriver: CreateDriver = (opts) =>
  new HandTrackingDriver(opts);

export interface UseHandControl {
  /** `undefined` = pre-hydration, `null` = unset (first visit), else the pref. */
  pref: HandControlPref | null | undefined;
  /** Latest driver status, or `null` before the driver emits / when disabled. */
  status: HandDriverStatus | null;
  /** Opt in: register a fresh driver (starts it) and persist `"on"`. */
  enable(): void;
  /** Opt out: stop + unregister the driver and persist `"off"`. */
  disable(): void;
  /** Recover from an error: swap in a fresh driver instance; pref stays `"on"`. */
  retry(): void;
  /** "Use mouse" on first visit: persist `"off"` without ever building a driver. */
  dismiss(): void;
}

function readStoredPref(): HandControlPref | null {
  try {
    const value = window.localStorage.getItem(HAND_CONTROL_PREF_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredPref(value: HandControlPref): void {
  try {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, value);
  } catch {
    // Private-mode / disabled storage: keep working in-memory this session.
  }
}

export function useHandControl(createDriver: CreateDriver): UseHandControl {
  const bus = useStudioInput();
  const [pref, setPref] = useState<HandControlPref | null | undefined>(undefined);
  const [status, setStatus] = useState<HandDriverStatus | null>(null);

  // The unregister fn returned by `bus.registerDriver` (calls `driver.stop()`).
  const unregisterRef = useRef<(() => void) | null>(null);
  // Keep the latest factory without forcing register() to change identity.
  const createDriverRef = useRef(createDriver);
  createDriverRef.current = createDriver;

  /**
   * Register a FRESH driver instance (D3): a reused instance would no-op on
   * retry because `HandTrackingDriver.start()` early-returns while its sink is
   * set. Any prior registration is torn down first.
   */
  const register = useCallback(() => {
    unregisterRef.current?.();
    const driver = createDriverRef.current({ onStatusChange: setStatus });
    // `registerDriver` both registers AND starts the driver; the returned fn
    // stops + unregisters it — so holding it is the complete disable path.
    unregisterRef.current = bus.registerDriver(driver);
  }, [bus]);

  const teardown = useCallback(() => {
    unregisterRef.current?.();
    unregisterRef.current = null;
  }, []);

  // Hydration + persisted auto-register (mount only). No camera prompt fires
  // unless the stored pref is already `"on"` (a prior explicit opt-in).
  useEffect(() => {
    const stored = readStoredPref();
    setPref(stored);
    if (stored === "on") register();
    return () => {
      teardown();
    };
  }, [register, teardown]);

  const enable = useCallback(() => {
    register();
    writeStoredPref("on");
    setPref("on");
  }, [register]);

  const disable = useCallback(() => {
    teardown();
    writeStoredPref("off");
    setPref("off");
    setStatus(null);
  }, [teardown]);

  const retry = useCallback(() => {
    register(); // unregisters the failed instance first, then starts fresh (D3)
  }, [register]);

  const dismiss = useCallback(() => {
    writeStoredPref("off");
    setPref("off");
  }, []);

  return { pref, status, enable, disable, retry, dismiss };
}
