/**
 * framing.ts — focus-framing math for the auto-center camera move.
 *
 * When a widget is expanded, the camera should center and frame THAT widget.
 * The studio camera never rotates (it looks straight down −Z from the
 * `<Canvas camera>` spawn — see {@link CameraRig}), so "framing" a widget at
 * world `[wx, wy, wz]` is simply matching its x/y and standing off in +Z by a
 * fixed distance. No clamping happens here: the camera-traversal controller is
 * the single owner of the rails, so this module returns an UNclamped target and
 * lets the controller clamp it.
 *
 * `frameWidgetCamera` is pure (no THREE, no React). `resolveWidgetWorldPosition`
 * reads the zone-assignment store singleton to find where a widget currently
 * sits — its assigned arc zone slot — so a reflow re-frames the widget at its new
 * zone. Both stay plain unit tests (the store exposes `moveWidgetToZone` +
 * `__resetZoneAssignment`).
 */

import { arcZoneSlots } from "@/components/studio/cloud/layout";
import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";
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
 * The camera target that frames a widget sitting at `widgetPos`. Because the
 * camera looks down −Z, framing is "match x/y, stand off in +Z". UNclamped —
 * the controller applies the rails.
 */
export function frameWidgetCamera(widgetPos: Vec3): Vec3 {
  return [widgetPos[0], widgetPos[1], widgetPos[2] + FOCUS_STANDOFF];
}

/**
 * The eight fixed amphitheater zone slots (index = zone), memoized at module
 * load. Deterministic and cheap; matches exactly what {@link WidgetCloud}
 * renders because both resolve positions from `arcZoneSlots`.
 */
const ZONE_SLOTS = arcZoneSlots(STUDIO_WIDGET_ORDER.length);

/**
 * A widget's world position: the center of its currently-assigned arc zone. The
 * assignment is a permutation of every widget id, so `indexOf` always resolves to
 * a valid zone; a drop reflows the assignment and this returns the NEW slot, so
 * the camera frames the widget wherever the reflow moved it.
 */
export function resolveWidgetWorldPosition(id: StudioWidgetId): Vec3 {
  const zone = getZoneAssignment().indexOf(id);
  const slot = ZONE_SLOTS[zone]!.position;
  return [slot[0], slot[1], slot[2]];
}
