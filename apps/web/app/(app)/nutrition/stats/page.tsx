import { requireOnboarded } from "@/lib/auth/get-user";
import {
  getYearlyAdherence,
  get7DayMacroTrend,
  getPersonalBests,
} from "@/lib/nutrition/nutrition-service";
import { NutritionStatsClient } from "@/components/nutrition/NutritionStatsClient";

/**
 * /nutrition/stats — Server Component shell for the nutrition stats surface.
 *
 * Closes D-11 (heat map) and D-12 (additional stats, bounded to 3 sections
 * per UI-SPEC).
 *
 * Loads yearly adherence, 7-day macro trend, and personal bests in a single
 * Promise.all, then hands off to the client island.
 *
 * Auth: requireOnboarded() → getClaims() under the hood (CLAUDE.md
 * Critical Pattern 1).
 */
export default async function NutritionStatsPage() {
  const user = await requireOnboarded();

  const [adherence, trend, bests] = await Promise.all([
    getYearlyAdherence(user.id),
    get7DayMacroTrend(user.id),
    getPersonalBests(user.id),
  ]);

  return (
    <NutritionStatsClient
      userId={user.id}
      adherence={adherence}
      trend={trend}
      bests={bests}
    />
  );
}
