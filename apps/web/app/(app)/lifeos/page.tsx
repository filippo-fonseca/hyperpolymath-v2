import { and, eq, isNull } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
} from "@/app/actions/habits";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import {
  getActivitiesInRange,
  getDistanceUnit,
} from "@/lib/db/queries/training";
import { LifeOsBanner } from "@/components/lifeos/LifeOsBanner";
import { LifeOsAreasSection } from "@/components/lifeos/LifeOsAreasSection";
import { LifeOsQuickSend } from "@/components/lifeos/LifeOsQuickSend";
import { LifeOsWallpaper } from "@/components/lifeos/LifeOsWallpaper";
import { LifeOsWidgetGrid } from "@/components/lifeos/LifeOsWidgetGrid";
import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";
import { TodayTrainingWidget } from "@/components/lifeos/TodayTrainingWidget";
import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";

export const dynamic = "force-dynamic";

/**
 * /lifeos — canonical homepage for the life-OS view.
 *
 * Composition top-to-bottom:
 *   1. Notion-style banner block (emoji + title + cover affordance)
 *   2. AreasTree as the centerpiece (mirrors /areas data fetch)
 *   3. At-a-glance widget grid: Recent captures · Today's habits · Upcoming tasks
 *
 * The three widgets are interactive client islands (quick task 260607-gox):
 * page.tsx is now the orchestrator that fetches initial data in one
 * Promise.all and hydrates each widget. They reuse existing TanStack Query
 * keys + Supabase Realtime subscriptions so toggles on /lifeos sync to
 * /habits / /captures / /tasks without manual refresh.
 *
 * TODO(lifeos-root-redirect): user confirmation pending — see Quick 260607-fgb step 9.
 */
export default async function LifeOsPage() {
  const user = await requireOnboarded();

  const today = new Date();
  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const todayISO = toISODate(today);

  const [
    initialHabits,
    initialCompletions,
    initialCaptures,
    availableProjects,
    initialTasks,
    initialTrainingActivities,
    distanceUnit,
  ] = await Promise.all([
    getHabitsForCurrentUser(),
    getHabitCompletionsInRange(todayISO, todayISO),
    getCapturesForUser(user.id),
    db
      .select({
        id: projects.id,
        name: projects.name,
        isClass: projects.isClass,
        courseCode: projects.courseCode,
      })
      .from(projects)
      .where(and(eq(projects.userId, user.id), isNull(projects.archivedAt))),
    getAllTasksForUser(user.id),
    getActivitiesInRange(user.id, todayISO, todayISO),
    getDistanceUnit(user.id),
  ]);

  return (
    <main className="relative min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <LifeOsWallpaper />
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        <LifeOsBanner
          title="LifeOS"
          emoji="◈"
          subtitle="One canvas for areas, captures, habits, and tasks."
        />
        <LifeOsQuickSend />
        <LifeOsAreasSection />
        <LifeOsWidgetGrid>
          <RecentCapturesWidget
            userId={user.id}
            initialCaptures={initialCaptures}
            availableProjects={availableProjects}
          />
          <TodayHabitsWidget
            userId={user.id}
            initialHabits={initialHabits}
            initialCompletions={initialCompletions}
            todayISO={todayISO}
          />
          <UpcomingTasksWidget
            userId={user.id}
            initialTasks={initialTasks}
          />
          <TodayTrainingWidget
            userId={user.id}
            initialActivities={initialTrainingActivities}
            distanceUnit={distanceUnit}
            todayISO={todayISO}
          />
        </LifeOsWidgetGrid>
      </div>
    </main>
  );
}
