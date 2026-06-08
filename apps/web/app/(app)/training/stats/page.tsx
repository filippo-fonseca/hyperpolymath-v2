import { requireOnboarded } from "@/lib/auth/get-user";
import {
  getActivityTypes,
  getAllActivities,
  getBatches,
  getDistanceUnit,
} from "@/lib/db/queries/training";
import { TrainingStatsClient } from "@/components/training/stats/TrainingStatsClient";

/**
 * /training/stats — Server Component shell for the stats surface (TRN-09,
 * TRN-10, TRN-11).
 *
 * Loads all-time activities + types + batches + distance preference in a
 * single Promise.all and hands them to the client island. The all-time
 * array is the source of truth for both the 12-month heatmap AND the
 * time-window-filtered supporting cards (the client filters in-memory so
 * Realtime invalidation only has one query key to refresh).
 *
 * Auth: requireOnboarded() → getClaims() under the hood (CLAUDE.md
 * Critical Pattern 1).
 */
export default async function TrainingStatsPage() {
  const user = await requireOnboarded();

  const [initialActivities, initialTypes, initialBatches, distanceUnit] =
    await Promise.all([
      getAllActivities(user.id),
      getActivityTypes(user.id),
      getBatches(user.id),
      getDistanceUnit(user.id),
    ]);

  return (
    <TrainingStatsClient
      userId={user.id}
      initialActivities={initialActivities}
      initialTypes={initialTypes}
      initialBatches={initialBatches}
      distanceUnit={distanceUnit}
    />
  );
}
