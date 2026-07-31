/**
 * Granular countdown label for an upcoming timed calendar event.
 * - ≤0 → "Now"
 * - <60m → "In 12 min"
 * - <24h → "In 1 hr 12 min" (minutes kept; never rounds away to a bare hour)
 * - farther → weekday short
 */
export function formatEventCountdown(
  startIso: string,
  allDay: boolean,
  nowMs: number = Date.now()
): string {
  if (allDay) return "All day";
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "Soon";

  const minutes = Math.round((start - nowMs) / 60_000);
  if (minutes <= 0) return "Now";
  if (minutes === 1) return "In 1 min";
  if (minutes < 60) return `In ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    const hourPart = hours === 1 ? "1 hr" : `${hours} hr`;
    if (mins === 0) return `In ${hourPart}`;
    const minPart = mins === 1 ? "1 min" : `${mins} min`;
    return `In ${hourPart} ${minPart}`;
  }

  return new Date(start).toLocaleDateString(undefined, { weekday: "short" });
}
