/**
 * manipulation-math — the grab-session constant shared by the controller.
 *
 * Framework-free (no three, no React). The drop math is now the zone model
 * (`nearestZone` in layout.ts + `moveWidgetToZone` in the zone-assignment store);
 * what survives here is the one tunable feel value the controller applies
 * imperatively.
 */

/**
 * Vertical lift (meters) applied to a grabbed card so it reads as picked up. A
 * pure translation offset, never a scale — widgets render at one uniform size.
 */
export const LIFT = 1.04;
