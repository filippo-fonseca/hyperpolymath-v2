"use client";

/**
 * useWidgetManipulation — grab-drag reposition for the cloud tiles, driven by
 * the U0 phase bus.
 *
 * A thin React shell around {@link createManipulationController}: the gesture
 * state machine (and all the non-trivial concurrency reasoning) lives in that
 * pure, unit-tested factory. This hook only wires it to the phase bus and keeps
 * its live inputs current.
 *
 * The controller is built ONCE and reads its inputs through a `deps` object this
 * hook mutates in place each render, so it always sees the latest props (slots,
 * groups, camera) without being rebuilt — preserving the original "callback
 * reads latest props each event" behavior. On unmount the controller is reset so
 * a remount starts with no dangling session.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { useStudioPhase } from "@/lib/studio/input/react";
import {
  resolveDefaultHandoffTarget,
  sendHandoff,
} from "@/lib/studio/state/window-registry";
import { type StudioWidgetId } from "../data/useStudioData";
import { type TileSlot } from "./layout";
import {
  createManipulationController,
  type ManipulationController,
  type ManipulationControllerDeps,
} from "./manipulation-controller";

export interface WidgetManipulationParams {
  /** Zone slot centers, indexed by zone (the drop target is the nearest one). */
  slots: readonly TileSlot[];
  /** Resolve a tile's registered OUTER group (the imperative write target). */
  getGroup: (id: StudioWidgetId) => THREE.Group | null;
  /** The fixed scene camera (for freeform unprojection). */
  camera: THREE.Camera;
  /** Demand a frame. */
  invalidate: () => void;
}

export function useWidgetManipulation({
  slots,
  getGroup,
  camera,
  invalidate,
}: WidgetManipulationParams): void {
  // A stable deps object, mutated in place so the controller always reads the
  // latest props without being rebuilt.
  const depsRef = useRef<ManipulationControllerDeps | null>(null);
  if (depsRef.current === null) {
    depsRef.current = {
      slots,
      getGroup,
      camera,
      invalidate,
      // Cross-window hand-off, backed by the window registry. Stable module
      // functions — no need to re-set them each render.
      resolveHandoffTarget: resolveDefaultHandoffTarget,
      sendHandoff,
    };
  } else {
    depsRef.current.slots = slots;
    depsRef.current.getGroup = getGroup;
    depsRef.current.camera = camera;
    depsRef.current.invalidate = invalidate;
  }

  const controllerRef = useRef<ManipulationController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createManipulationController(depsRef.current);
  }

  // Inline callback is fine — `useStudioPhase` always invokes the latest one via
  // a ref, and the controller identity is stable.
  useStudioPhase((phase) => controllerRef.current!.handlePhase(phase));

  // Clear any dangling session on unmount so a remount starts clean.
  useEffect(() => {
    const controller = controllerRef.current!;
    return () => controller.reset();
  }, []);
}
