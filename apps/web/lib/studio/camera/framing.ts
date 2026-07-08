/**
 * framing.ts — pure focus-framing math for the auto-center camera move.
 *
 * When a widget is expanded, the camera should center and frame THAT widget.
 * The studio camera never rotates (it looks straight down −Z from the
 * `<Canvas camera>` spawn — see {@link CameraRig}), so "framing" a widget at
 * world `[wx, wy, wz]` is simply matching its x/y and standing off in +Z by a
 * fixed distance. No clamping happens here: the camera-traversal controller is
 * the single owner of the rails, so this module returns an UNclamped target and
 * lets the controller clamp it.
 *
 * Framework-free (no THREE, no React, no `"use client"`), exactly like
 * {@link ./traversal}, so every export is a plain unit test.
 */

import {
  CLOUD_CAP_DEG,
  CLOUD_CENTER,
  CLOUD_RADIUS,
  fibonacciCapSlots,
} from "@/components/studio/cloud/layout";
import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";
import { getWidgetTransform } from "@/lib/studio/state/widget-transforms";
import type { Vec3 } from "./traversal";

/**
 * Camera standoff (meters) in front of a focused widget along +Z. A principled
 * starting value: cap widgets sit at z ≈ 0.82–2.4, so the framed camera z lands
 * in ≈ 3.42–5.0 — inside the controller's `boundsZ [3.2, 9]` and clear of the
 * nearest tile face. Exported so it stays a single tunable feel parameter.
 */
export const FOCUS_STANDOFF = 2.6;

/**
 * The camera target that frames a widget sitting at `widgetPos`. Because the
 * camera looks down −Z, framing is "match x/y, stand off in +Z". UNclamped —
 * the controller applies the rails.
 */
export function frameWidgetCamera(widgetPos: Vec3): Vec3 {
  return [widgetPos[0], widgetPos[1], widgetPos[2] + FOCUS_STANDOFF];
}

/**
 * The canonical layout slots, memoized at module load. Deterministic and cheap;
 * matches exactly what {@link WidgetCloud} renders because both read the shared
 * `CLOUD_*` constants.
 */
const CANONICAL_SLOTS = fibonacciCapSlots(STUDIO_WIDGET_ORDER.length, {
  radius: CLOUD_RADIUS,
  center: CLOUD_CENTER,
  capDeg: CLOUD_CAP_DEG,
});

/**
 * A widget's EFFECTIVE world position: its committed U2 drag/pull override if
 * one exists, otherwise its canonical cap slot. This is the point the camera
 * frames, so a widget dragged elsewhere is framed where it actually sits.
 */
export function resolveWidgetWorldPosition(id: StudioWidgetId): Vec3 {
  const override = getWidgetTransform(id).position;
  if (override) return [override[0], override[1], override[2]];
  const slot = CANONICAL_SLOTS[STUDIO_WIDGET_ORDER.indexOf(id)]!.position;
  return [slot[0], slot[1], slot[2]];
}
