import { requireOnboarded } from "@/lib/auth/get-user";
import { format } from "date-fns";
import {
  listFoodLogsForDay,
  getFoodHistory,
  getNutritionTargets,
} from "@/lib/nutrition/nutrition-service";
import { NutritionClient } from "@/components/nutrition/NutritionClient";

/**
 * /nutrition — Server Component shell + NutritionClient island.
 *
 * Loads today's food logs, personal food history, and macro targets.
 * Hands everything to the client island as initial data so first paint
 * matches SSR (no loading state on the day view).
 *
 * Auth: requireOnboarded() → getClaims() under the hood (CLAUDE.md Critical
 * Pattern 1).
 *
 * NOTE: format(new Date(), "yyyy-MM-dd") produces local-timezone date, not UTC
 * (Pitfall 6 — per UI-SPEC). This is intentional.
 */
export default async function NutritionPage() {
  const user = await requireOnboarded();
  const today = format(new Date(), "yyyy-MM-dd");

  const [initialLogs, foodHistory, targets] = await Promise.all([
    listFoodLogsForDay(user.id, today),
    getFoodHistory(user.id, { limit: 20 }),
    getNutritionTargets(user.id),
  ]);

  return (
    <NutritionClient
      userId={user.id}
      initialDate={today}
      initialLogs={initialLogs}
      foodHistory={foodHistory}
      targets={targets}
    />
  );
}
