import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { flowSessions as flowSessionsTable } from '@/lib/db/schema';
import { err, ok, type Result } from '@/lib/integrations/result';
import type { Session } from '@/lib/integrations/flow/bucket';

export type { Session, DayBucket } from '@/lib/integrations/flow/bucket';
export { bucketByDayForWeek } from '@/lib/integrations/flow/bucket';

/**
 * Flow Pomodoro sessions — backed by flow_sessions table.
 *
 * Data lives in Postgres now (was: ~/Desktop/Flow-Stats.csv). Upload via
 * the action at apps/web/app/actions/flow.ts → uploadFlowCsv(formData).
 * Types + bucketByDayForWeek live in ./bucket.ts (client-safe).
 */

interface Cached {
  at: number;
  userId: string;
  data: Result<Session[]>;
}
let cache: Cached | null = null;
const CACHE_TTL_MS = 60 * 1000;

export async function getFlowSessions(): Promise<Result<Session[]>> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return err('Not signed in');
  }
  const userId = claimsData.claims.sub;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const rows = await db
      .select({
        startedAt: flowSessionsTable.startedAt,
        completedAt: flowSessionsTable.completedAt,
        durationMs: flowSessionsTable.durationMs,
      })
      .from(flowSessionsTable)
      .where(eq(flowSessionsTable.userId, userId))
      .orderBy(asc(flowSessionsTable.startedAt));

    const sessions: Session[] = rows.map((r) => ({
      started: r.startedAt,
      completed: r.completedAt,
      durationMs: r.durationMs,
    }));

    const result = ok(sessions);
    cache = { at: Date.now(), userId, data: result };
    return result;
  } catch (e) {
    return err(`Flow: ${e instanceof Error ? e.message : String(e)}`);
  }
}
