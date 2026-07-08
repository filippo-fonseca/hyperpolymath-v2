/**
 * manipulation-math — pure session arithmetic for widget manipulation.
 *
 * Framework-free (no three, no React) so the non-trivial gesture math — pull
 * rebasing, effective scale, commit thresholds, snap-to-override — is directly
 * unit-testable without a WebGL/jsdom harness. `useWidgetManipulation` composes
 * these; the imperative three glue lives there.
 */

import { clampScale } from "@/lib/studio/state/widget-transforms";
import { type StudioWidgetId } from "@/components/studio/data/useStudioData";

type Vec3 = readonly [number, number, number];

/** Extra scale applied while a widget is grabbed, so the lift reads visually. */
export const LIFT = 1.04;

/** How close a committed scale must be to 1 to be dropped (keeps defaults clean). */
export const SCALE_COMMIT_EPS = 0.01;

/**
 * The scale a pulled widget should take. `pullDelta` is a log2 palm-size ratio
 * (one apparent doubling ⇒ delta 1), so `2^(delta − deltaOffset)` maps a hand
 * spread symmetrically onto scale. `deltaOffset` rebases the ramp to wherever
 * the target was acquired (0 at pull start; the live delta when a grab retargets
 * mid-pull), so retargeting never pops. Result is clamped to the scale bounds.
 */
export function effectiveScale(
  baseScale: number,
  delta: number,
  deltaOffset: number,
): number {
  return clampScale(baseScale * Math.pow(2, delta - deltaOffset));
}

/**
 * Pull target precedence (PLAN.md decision 3): the grabbed widget wins; else the
 * active (focused) widget; else nothing (an idle pinch over empty space is a
 * no-op). The active-widget store is only ever READ for this.
 */
export function resolvePullTarget(
  grabTargetId: StudioWidgetId | null,
  activeHead: StudioWidgetId | null,
): StudioWidgetId | null {
  return grabTargetId ?? activeHead;
}

/**
 * The scale value to commit to the store on pull end: `null` (drop the override,
 * keeping defaults clean) when within `eps` of 1, otherwise the value itself.
 */
export function commitScaleValue(
  effective: number,
  eps: number = SCALE_COMMIT_EPS,
): number | null {
  return Math.abs(effective - 1) <= eps ? null : effective;
}

/**
 * The position value to commit on grab end, given the snap result:
 * - no snap (`null` index) → settle freeform where released;
 * - snapped to the widget's OWN default slot → `null` (clear the override so
 *   `layout.ts` demonstrably remains the fallback);
 * - snapped to another anchor → that anchor's position.
 */
export function snapToCommit(
  snapIdx: number | null,
  ownIdx: number,
  anchors: readonly Vec3[],
  released: Vec3,
): [number, number, number] | null {
  if (snapIdx === null) return [released[0], released[1], released[2]];
  if (snapIdx === ownIdx) return null;
  const a = anchors[snapIdx]!;
  return [a[0], a[1], a[2]];
}
