/**
 * Client-safe Strava types + constants (260607-h2k).
 *
 * Split out of `activities.ts` because that module is `import 'server-only'`
 * (it pulls in the Postgres `db` client). Client components — StravaPanel,
 * LifeTabPanel, InsightsTabs — need these types/constants, and importing the
 * runtime values (SPORT_CATEGORIES / SPORT_LABELS) from the server-only module
 * dragged `postgres` (and node `tls`/`net`) into the browser bundle, breaking
 * the production build. Keep this file free of any server-only imports.
 */

export type SportCategory = 'Ride' | 'Run' | 'HIIT';
export const SPORT_CATEGORIES: SportCategory[] = ['Ride', 'Run', 'HIIT'];
export const SPORT_LABELS: Record<SportCategory, string> = {
  Ride: 'Bike',
  Run: 'Run',
  HIIT: 'HIIT',
};

export interface Activity {
  id: number;
  name: string;
  type: string;
  sportType: string;
  category: SportCategory | null;
  distanceMeters: number;
  movingTimeSeconds: number;
  startDate: string; // ISO
  totalElevationGain: number;
  averageSpeedMps: number;
}

export interface WeeklyStats {
  weekStart: string; // YYYY-MM-DD (Monday)
  distanceMeters: number;
  movingTimeSeconds: number;
  activityCount: number;
}

export interface SportSummary {
  category: SportCategory;
  weeklyStats: WeeklyStats[]; // most-recent-first; [0] = current week
  totalDistanceMeters: number;
  totalMovingTimeSeconds: number;
  totalElevationGain: number;
  totalCount: number;
}

export interface StravaData {
  activities: Activity[];
  sports: Record<SportCategory, SportSummary>;
}
