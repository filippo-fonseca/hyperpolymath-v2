/**
 * Drawer-stow hit test (pure, DOM-free).
 *
 * A drag drops a widget into the widget closet drawer only when the widget's
 * own CLAMPED on-screen geometry genuinely reaches the drawer — not when the
 * raw pointer does. The pointer and the widget body diverge during a drag:
 * `clampToStage` keeps a large widget's body on-stage while the synthetic hand
 * pointer keeps travelling toward the right edge, so a pointer-based test stows
 * big widgets almost every time even when released far from the drawer (#305).
 *
 * Decision rule: stow when the widget's horizontal CENTER is past
 * `drawerRect.left - margin` AND the widget vertically overlaps the drawer.
 *
 * Fallback for very wide widgets: because the clamp prevents a huge widget's
 * center from ever crossing the drawer's left edge, the center test can be
 * unreachable. The drawer is anchored to the stage's right edge, so
 * `drawerRect.right` is effectively the stage's right boundary and the widest a
 * clamped widget's center can travel is `drawerRect.right - widgetWidth / 2`.
 * When even that maximum can't cross the primary threshold, we instead require
 * the widget's RIGHT EDGE to reach into the drawer rect proper (no margin) so
 * the widest widgets remain stowable by a deliberate drop.
 */

export interface EdgeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Small forgiveness margin (px) on the drawer's left edge for the center test. */
export const DRAWER_STOW_MARGIN = 24;

export function shouldStowInDrawer(
  widgetRect: EdgeRect,
  drawerRect: EdgeRect,
  margin: number = DRAWER_STOW_MARGIN,
): boolean {
  // A drop only counts if the widget actually shares vertical extent with the
  // drawer column; a widget parked above or below it never stows.
  const overlapsVertically =
    widgetRect.top < drawerRect.bottom && widgetRect.bottom > drawerRect.top;
  if (!overlapsVertically) return false;

  const widgetWidth = widgetRect.right - widgetRect.left;
  const centerX = (widgetRect.left + widgetRect.right) / 2;
  const primaryThreshold = drawerRect.left - margin;
  const maxReachableCenterX = drawerRect.right - widgetWidth / 2;

  // Widget too wide for its center to ever cross the threshold → right-edge
  // fallback (deliberate drops only).
  if (maxReachableCenterX < primaryThreshold) {
    return widgetRect.right >= drawerRect.left;
  }

  return centerX >= primaryThreshold;
}
