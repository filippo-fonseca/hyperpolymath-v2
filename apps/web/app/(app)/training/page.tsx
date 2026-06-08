import { requireOnboarded } from "@/lib/auth/get-user";
import {
  getActivitiesInRange,
  getActivityTypes,
  getBatches,
  getDistanceUnit,
} from "@/lib/db/queries/training";
import { getWeekRange } from "@/lib/training/week";
import { TrainingClient } from "@/components/training/TrainingClient";

/**
 * /training — Server Component shell + TrainingClient island.
 *
 * Loads the current Mon–Sun week of activities plus the user's full set of
 * types + batches and the global distance preference. Hands everything to the
 * client island as initial data so first paint matches SSR (no loading state
 * on the planner board).
 *
 * Auth: requireOnboarded() → getClaims() under the hood (CLAUDE.md Critical
 * Pattern 1).
 */
export default async function TrainingPage() {
  const user = await requireOnboarded();
  const { startISO, endISO } = getWeekRange(new Date());

  const [initialActivities, initialTypes, initialBatches, distanceUnit] =
    await Promise.all([
      getActivitiesInRange(user.id, startISO, endISO),
      getActivityTypes(user.id),
      getBatches(user.id),
      getDistanceUnit(user.id),
    ]);

  return (
    <TrainingClient
      userId={user.id}
      initialActivities={initialActivities}
      initialTypes={initialTypes}
      initialBatches={initialBatches}
      distanceUnit={distanceUnit}
    />
  );
}
