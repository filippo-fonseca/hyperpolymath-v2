/**
 * Distance unit conversion + display helpers (Phase 15 — Training).
 *
 * D-10: km is the canonical storage unit in the database. The display layer
 * converts to the user's preferred unit (`users.distance_unit`). Inputs from
 * forms are converted to km BEFORE submitting to a Server Action — the API
 * boundary always speaks km.
 */

export type DistanceUnit = "km" | "mi";

export const KM_PER_MILE = 1.609344;

/** km → user's display unit. */
export function kmToDisplay(km: number, unit: DistanceUnit): number {
  return unit === "km" ? km : km / KM_PER_MILE;
}

/** User-entered display value → canonical km (write-side). */
export function displayToKm(value: number, unit: DistanceUnit): number {
  return unit === "km" ? value : value * KM_PER_MILE;
}

/**
 * Format a stored km value for display in the user's preferred unit.
 * Returns the em-dash placeholder for null inputs (mirrors `formatDistance("—")`
 * conventions in the rest of the app's read-only surfaces).
 */
export function formatDistance(
  km: number | null | undefined,
  unit: DistanceUnit,
): string {
  if (km == null) return "—";
  const v = kmToDisplay(km, unit);
  return `${v.toFixed(v < 10 ? 2 : 1)} ${unit}`;
}
