import 'server-only';
import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { err, ok, type Result } from '@/lib/integrations/result';

/**
 * Flow Pomodoro sessions data layer (260607-h2k, Task 8 + D-04 + D-07).
 *
 * Path: $FLOW_STATS_PATH ?? ~/Desktop/Flow-Stats.csv. Local fs only.
 * Pure helper `bucketByDayForWeek` is exported separately for the panel
 * to call from a useMemo (the panel owns weekStart as local useState per D-07).
 */

export interface Session {
  started: Date;
  completed: Date;
  durationMs: number;
}

export interface DayBucket {
  date: string; // YYYY-MM-DD
  weekday: number; // 0=Mon ... 6=Sun (ISO)
  minutes: number;
  sessionCount: number;
}

interface Cached {
  at: number;
  data: Result<Session[]>;
}
let cache: Cached | null = null;
const CACHE_TTL_MS = 60 * 1000;

function resolvePath(): string {
  return (
    process.env.FLOW_STATS_PATH ?? path.join(homedir(), 'Desktop', 'Flow-Stats.csv')
  );
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoMondayIndex(d: Date): number {
  // JS: 0=Sun..6=Sat → ISO: 0=Mon..6=Sun.
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export async function getFlowSessions(): Promise<Result<Session[]>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const p = resolvePath();
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ENOENT')) {
      return err('Flow stats not found at ~/Desktop/Flow-Stats.csv');
    }
    return err(`Flow: ${msg}`);
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Flow CSV parse failed: ${msg}`);
  }

  const sessions: Session[] = [];
  for (const row of rows) {
    const startedRaw = row.Started ?? row.started ?? '';
    const completedRaw = row.Completed ?? row.completed ?? '';
    if (!startedRaw || !completedRaw) continue;
    const started = new Date(startedRaw);
    const completed = new Date(completedRaw);
    if (Number.isNaN(started.getTime()) || Number.isNaN(completed.getTime())) {
      continue;
    }
    const durationMs = completed.getTime() - started.getTime();
    if (durationMs < 0) continue;
    sessions.push({ started, completed, durationMs });
  }

  const result = ok(sessions);
  cache = { at: Date.now(), data: result };
  return result;
}

/**
 * Pure helper — bucket sessions into 7 day-buckets Mon..Sun starting at weekStart.
 * Sessions are attributed to their `started`-day bucket.
 */
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
