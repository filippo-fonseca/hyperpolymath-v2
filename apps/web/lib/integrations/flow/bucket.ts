/**
 * Flow Pomodoro pure helpers — safe to import from client components.
 *
 * Split out of sessions.ts (which uses `server-only` for fs access) so the
 * FlowPanel client component can call `bucketByDayForWeek` without dragging
 * node:fs into the client bundle.
 */

export interface Session {
  started: Date;
  completed: Date;
  durationMs: number;
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
    const t = s.started.getTime();
    if (t < weekStartMs || t >= weekEndMs) continue;
    const idx = isoMondayIndex(s.started);
    const bucket = buckets[idx];
    if (!bucket) continue;
    bucket.minutes += s.durationMs / 60000;
    bucket.sessionCount += 1;
  }
  return buckets;
}
