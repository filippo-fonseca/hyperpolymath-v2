/**
 * manipulation-math — pure session arithmetic for widget manipulation.
 *
 * Framework-free (no three, no React) so the non-trivial gesture math — the grab
 * lift and snap-to-override commit — is directly unit-testable without a
 * WebGL/jsdom harness. `useWidgetManipulation` composes these; the imperative
 * three glue lives there.
 */

type Vec3 = readonly [number, number, number];

/**
 * Vertical lift (meters) applied to a grabbed card so it reads as picked up. A
 * pure translation offset, never a scale — widgets render at one uniform size.
 */
export const LIFT = 1.04;

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
