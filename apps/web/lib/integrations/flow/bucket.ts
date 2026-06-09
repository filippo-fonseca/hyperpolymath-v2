/**
 * Flow Pomodoro pure helpers — safe to import from client components.
 *
 * Split out of sessions.ts (which uses `server-only` for fs access) so the
 * FlowPanel client component can call `bucketByDayForWeek` without dragging
 * node:fs into the client bundle.
 */

// Dates may arrive as ISO strings after RSC Flight serialization (the wire
// format coerces Date instances to strings on the boundary). Accept both
// and normalize via toDate() before use.
export interface Session {
  started: Date | string;
  completed: Date | string;
  durationMs: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

export interface DayBucket {
  date: string;
  weekday: number;
  minutes: number;
  sessionCount: number;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoMondayIndex(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function bucketByDayForWeek(
  sessions: Session[],
  weekStart: Date,
): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setHours(0, 0, 0, 0);
    day.setDate(weekStart.getDate() + i);
    buckets.push({
      date: ymdLocal(day),
      weekday: i,
      minutes: 0,
      sessionCount: 0,
    });
  }

  const weekStartMs = (() => {
    const x = new Date(weekStart);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  })();
  const weekEndMs = weekStartMs + 7 * 86400 * 1000;

  for (const s of sessions) {
    const started = toDate(s.started);
    const t = started.getTime();
    if (t < weekStartMs || t >= weekEndMs) continue;
    const idx = isoMondayIndex(started);
    const bucket = buckets[idx];
    if (!bucket) continue;
    bucket.minutes += s.durationMs / 60000;
    bucket.sessionCount += 1;
  }
  return buckets;
}
