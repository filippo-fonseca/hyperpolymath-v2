const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Strict short relative stamp, no suffix: "now", "5m", "2h", "3d", "2w", "Jan 4". */
export function relativeStamp(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const delta = Math.max(0, now - then);
  if (delta < MINUTE) return "now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`;
  if (delta < 5 * WEEK) return `${Math.floor(delta / WEEK)}w`;
  const d = new Date(then);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Full stamp for the detail sheet: "Aug 9, 2026 · 21:14". */
export function fullStamp(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const d = new Date(then);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${hh}:${mm}`;
}

/** Hashtag names typed inline, without the leading #. */
export function parseHashtags(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(/#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu)) {
    const name = match[1];
    if (name) seen.add(name.toLowerCase());
  }
  return [...seen];
}
