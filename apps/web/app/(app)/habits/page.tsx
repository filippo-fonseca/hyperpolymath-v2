import { and, eq, isNull } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { areas } from "@/lib/db/schema";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
  getHabitDockToday,
} from "@/app/actions/habits";
import { toISODate } from "@/lib/habits/dates";
import { HabitsClient } from "@/components/habits/HabitsClient";

/**
 * /habits — dashboard for the habits primitive.
 *
 * Habits are a peer of Projects (same hierarchy tier under Areas, M:N to
 * many areas). The page is one document: today's check-off list on top,
 * every active habit below with manage controls, archive revealed on demand.
 *
 * Server-fetches (seeds; the client refetches under its own local date when
 * the server's differs):
 *   - full active habit list (joined with area chips)
 *   - today's completions (the cache entry the dock widget and the LifeOS
 *     tile share)
 *   - streak bases + 28-day rate via getHabitDockToday
 *   - active areas (for the create + edit dialogs' area multi-select)
 * The archive list is deliberately NOT fetched here; most sessions never
 * open it, so the client loads it on reveal.
 */
export default async function HabitsPage() {
  const user = await requireOnboarded();

  const serverToday = toISODate(new Date());

  const [habits, todayCompletions, meta, activeAreas] = await Promise.all([
    getHabitsForCurrentUser(),
    getHabitCompletionsInRange(serverToday, serverToday),
    getHabitDockToday(serverToday),
    db
      .select({
        id: areas.id,
        name: areas.name,
        emoji: areas.emoji,
      })
      .from(areas)
      .where(and(eq(areas.userId, user.id), isNull(areas.archivedAt))),
  ]);

  return (
    <HabitsClient
      userId={user.id}
      serverToday={serverToday}
      initialHabits={habits}
      initialTodayCompletions={todayCompletions}
      initialMeta={meta}
      areas={activeAreas}
    />
  );
}
