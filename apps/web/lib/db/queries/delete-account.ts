import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  users,
  projects,
  trainingActivities,
  foodLogs,
  mealItems,
} from "@/lib/db/schema";

/**
 * Hard-delete every row owned by `userId`.
 *
 * `public.users` → `auth.users` is ON DELETE CASCADE and nearly every
 * user-scoped table cascades from `public.users`, so deleting the users row
 * wipes the long tail automatically. The four tables below sit behind ON
 * DELETE RESTRICT foreign keys that would otherwise abort the cascade, so they
 * are cleared explicitly first:
 *   - projects → areas
 *   - training_activities → training_activity_types
 *   - food_logs → foods
 *   - meal_items → foods
 * Everything runs in a single transaction so a partial wipe is impossible.
 *
 * The caller is responsible for deleting the `auth.users` row afterwards (via
 * the admin API) to fully remove the account.
 */
export async function deleteAllUserData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(trainingActivities).where(eq(trainingActivities.userId, userId));
    await tx.delete(foodLogs).where(eq(foodLogs.userId, userId));
    await tx.delete(mealItems).where(eq(mealItems.userId, userId));
    await tx.delete(projects).where(eq(projects.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
