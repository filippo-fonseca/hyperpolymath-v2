import 'server-only';
import strava from 'strava-v3';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { integrationTokens } from '@/lib/db/schema';
import { err, ok, type Result } from '@/lib/integrations/result';

/**
 * Strava activities data layer (260607-h2k, Task 7).
 *
 * `strava-v3` v4 has NO `on_token_refresh` hook — we own the rotation write.
 * After every `strava.oauth.refreshToken()` we MUST persist the rotated
 * refresh_token to integration_tokens BEFORE doing any other API call,
 * otherwise the next session is broken (D-03).
 */

const clientId = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;

if (clientId && clientSecret) {
  strava.config({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: 'http://localhost:3000', // unused in refresh-only flow
  });
}

// Sports types + constants live in ./types (client-safe). This module is
// `server-only` (it imports the Postgres db client), so its runtime values must
// NOT be imported by client components — they import from ./types directly. We
// import here for internal use and re-export so existing server-side imports of
// these symbols from this module keep resolving.
import {
  SPORT_CATEGORIES,
  SPORT_LABELS,
  type Activity,
  type SportCategory,
  type SportSummary,
  type StravaData,
  type WeeklyStats,
} from './types';

export { SPORT_CATEGORIES, SPORT_LABELS };
export type { Activity, SportCategory, SportSummary, StravaData, WeeklyStats };

interface CacheEntry {
  at: number;
  data: Result<StravaData>;
}
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface RawActivity {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  start_date: string;
  total_elevation_gain: number;
  average_speed: number;
}

/**
 * Bucket a Strava activity into Bike / Run / HIIT. `sport_type` is the modern,
 * granular field; `type` is the legacy enum (where HIIT collapses to
 * "Workout"). We check both so Garmin-synced lifts land under HIIT.
 */
function classify(type: string, sportType: string): SportCategory | null {
  const hay = `${sportType} ${type}`.toLowerCase();
  if (hay.includes('ride')) return 'Ride';
  if (hay.includes('run')) return 'Run';
  if (
    /highintensityintervaltraining|hiit|workout|weighttraining|crossfit/.test(
      hay,
    )
  ) {
    return 'HIIT';
  }
  return null;
}

function mapActivity(raw: RawActivity): Activity {
  const sportType = raw.sport_type ?? raw.type;
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    sportType,
    category: classify(raw.type, sportType),
    distanceMeters: raw.distance ?? 0,
    movingTimeSeconds: raw.moving_time ?? 0,
    startDate: raw.start_date,
    totalElevationGain: raw.total_elevation_gain ?? 0,
    averageSpeedMps: raw.average_speed ?? 0,
  };
}

function computeWeeklyStats(activities: Activity[]): WeeklyStats[] {
  const now = new Date();
  const thisMon = mondayOf(now);
  const weeks: WeeklyStats[] = [];
  for (let i = 0; i < 4; i++) {
    const start = new Date(thisMon);
    start.setDate(thisMon.getDate() - i * 7);
    weeks.push({
      weekStart: ymdLocal(start),
      distanceMeters: 0,
      movingTimeSeconds: 0,
      activityCount: 0,
    });
  }
  for (const a of activities) {
    const start = new Date(a.startDate);
    const mon = mondayOf(start);
    const key = ymdLocal(mon);
    const bucket = weeks.find((w) => w.weekStart === key);
    if (!bucket) continue;
    bucket.distanceMeters += a.distanceMeters;
    bucket.movingTimeSeconds += a.movingTimeSeconds;
    bucket.activityCount += 1;
  }
  // Order most-recent-first so weeks[0] = this week.
  return weeks;
}

function summarizeSport(
  category: SportCategory,
  activities: Activity[],
): SportSummary {
  const ours = activities.filter((a) => a.category === category);
  return {
    category,
    weeklyStats: computeWeeklyStats(ours),
    totalDistanceMeters: ours.reduce((s, a) => s + a.distanceMeters, 0),
    totalMovingTimeSeconds: ours.reduce((s, a) => s + a.movingTimeSeconds, 0),
    totalElevationGain: ours.reduce((s, a) => s + a.totalElevationGain, 0),
    totalCount: ours.length,
  };
}

export async function getStravaActivities(
  userId: string,
): Promise<Result<StravaData>> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  try {
    if (!clientId || !clientSecret) {
      return err(
        'Strava not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env.local.',
      );
    }

    // 1. Read stored token row.
    const rows = await db
      .select()
      .from(integrationTokens)
      .where(
        and(
          eq(integrationTokens.userId, userId),
          eq(integrationTokens.provider, 'strava'),
        ),
      )
      .limit(1);
    const stored = rows[0];
    if (!stored || !stored.refreshToken) {
      return err('Strava not connected. Run: node tools/strava-mint.mjs');
    }

    // 2. Determine if access token is expired (or within 60s of expiry).
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = stored.expiresAt
      ? Math.floor(new Date(stored.expiresAt).getTime() / 1000)
      : 0;
    let useableAccessToken = stored.accessToken ?? '';

    if (!useableAccessToken || expSec < nowSec + 60) {
      // 3. Refresh.
      let refreshed: {
        token_type: string;
        access_token: string;
        expires_at: number;
        expires_in: number;
        refresh_token: string;
      };
      try {
        refreshed = await strava.oauth.refreshToken(stored.refreshToken);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('401') || /unauth/i.test(msg)) {
          return err(
            'Strava token rejected — reconnect required (run tools/strava-mint.mjs)',
          );
        }
        return err(`Strava refresh failed: ${msg}`);
      }

      // 4. PERSIST the rotated refresh_token BEFORE any other API call.
      try {
        await db
          .update(integrationTokens)
          .set({
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            expiresAt: new Date(refreshed.expires_at * 1000),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(integrationTokens.userId, userId),
              eq(integrationTokens.provider, 'strava'),
            ),
          );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err(
          `Strava token persistence failed — next call will be dead: ${msg}`,
        );
      }

      useableAccessToken = refreshed.access_token;
    }

    // 5. Fetch activities (last 30 days).
    const after = Math.floor(Date.now() / 1000) - 30 * 86400;
    let raw: RawActivity[];
    try {
      raw = (await strava.athlete.listActivities({
        access_token: useableAccessToken,
        after,
        per_page: 100,
      })) as RawActivity[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('401') || /unauth/i.test(msg)) {
        return err(
          'Strava token rejected — reconnect required (run tools/strava-mint.mjs)',
        );
      }
      if (msg.includes('429') || /rate/i.test(msg)) {
        return err('Strava rate-limited; try again in a few minutes');
      }
      return err(`Strava: ${msg}`);
    }

    const activities = Array.isArray(raw) ? raw.map(mapActivity) : [];
    activities.sort((a, b) =>
      a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
    );
    const sports = {
      Ride: summarizeSport('Ride', activities),
      Run: summarizeSport('Run', activities),
      HIIT: summarizeSport('HIIT', activities),
    } satisfies Record<SportCategory, SportSummary>;

    const result = ok({ activities, sports });
    cache.set(userId, { at: Date.now(), data: result });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Strava: ${msg}`);
  }
}
