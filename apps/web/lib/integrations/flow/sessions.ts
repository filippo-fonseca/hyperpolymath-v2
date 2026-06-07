import 'server-only';
import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { err, ok, type Result } from '@/lib/integrations/result';
import type { Session } from '@/lib/integrations/flow/bucket';

export type { Session, DayBucket } from '@/lib/integrations/flow/bucket';
export { bucketByDayForWeek } from '@/lib/integrations/flow/bucket';

/**
 * Flow Pomodoro sessions data layer (260607-h2k, Task 8 + D-04 + D-07).
 *
 * Path: $FLOW_STATS_PATH ?? ~/Desktop/Flow-Stats.csv. Local fs only.
 * Types + bucketByDayForWeek live in ./bucket.ts (client-safe).
 */

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
