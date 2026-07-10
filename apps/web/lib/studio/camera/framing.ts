/**
 * framing.ts — focus-framing math for the auto-center camera move.
 *
 * When a widget is expanded, the camera should center and frame THAT widget.
 * Position framing still stands the camera off in +Z of the widget (matching
 * x/y). The live {@link CameraRig} then soft look-ats the widget (or the
 * amphitheater pivot when nothing is focused) so the seat reads as a theatre,
 * not an orthographic slide. No clamping here: the traversal controller owns
 * the rails; this module returns an UNclamped target.
 *
 * `frameWidgetCamera` is pure (no THREE, no React). `resolveWidgetWorldPosition`
 * reads the zone-assignment store singleton to find where a widget currently
 * sits — its assigned arc zone slot — so a reflow re-frames the widget at its new
 * zone. Both stay plain unit tests (the store exposes `moveWidgetToZone` +
 * `__resetZoneAssignment`).
 *
 * Under multi-window ownership the assignment is only THIS window's owned subset,
 * so its length varies and a widget may not be present at all (owned by a peer,
 * or in flight during a handoff). The slots are therefore resolved per call from
 * the live assignment length, and an unowned id resolves to `null` so the caller
 * simply skips framing instead of crashing.
 */

import { arcZoneSlots, DEFAULT_ARC_ZONES } from "@/components/studio/cloud/layout";
import { type StudioWidgetId } from "@/components/studio/data/useStudioData";
import { getFrontRow } from "@/lib/studio/state/active-row";
import { getZoneAssignment } from "@/lib/studio/state/zone-assignment";
import type { Vec3 } from "./traversal";

/**
 * Camera standoff (meters) in front of a focused widget along +Z. A principled
 * starting value: arc slots sit at z ≈ 0.4–2.0, so the framed camera z lands
 * in ≈ 3.0–4.6 — inside the controller's `boundsZ [3.2, 9]` and clear of the
 * nearest tile face. Exported so it stays a single tunable feel parameter.
 */
export const FOCUS_STANDOFF = 2.6;

/**
 * The camera *position* target that frames a widget sitting at `widgetPos`:
 * match x/y, stand off in +Z. Orientation is handled separately by CameraRig's
 * soft look-at. UNclamped — the controller applies the rails.
 */
export function frameWidgetCamera(widgetPos: Vec3): Vec3 {
  return [widgetPos[0], widgetPos[1] + 0.08, widgetPos[2] + FOCUS_STANDOFF];
}

/**
 * A widget's world position: the center of its currently-assigned arc zone, or
 * `null` when this window does not own the widget (owned by a peer window, or in
 * flight during a cross-window handoff). Slots are resolved per call from the
 * live owned assignment (length ≤ 8, called on focus transitions only), matching
 * exactly what {@link WidgetCloud} renders. A reflow returns the widget's NEW
 * slot, so the camera frames it wherever the reflow moved it.
 */
export function resolveWidgetWorldPosition(id: StudioWidgetId): Vec3 | null {
  const assignment = getZoneAssignment();
  const zone = assignment.indexOf(id);
  if (zone === -1) return null; // not owned here → caller skips framing
  // Resolve at the active front row so a focus move after a row swap frames the
  // widget at its post-swap slot, not the pre-swap one.
  const slot = arcZoneSlots(assignment.length, DEFAULT_ARC_ZONES, getFrontRow())[
    zone
  ]!.position;
  return [slot[0], slot[1], slot[2]];
}
