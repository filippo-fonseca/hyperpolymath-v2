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
import { LifeOsHero } from "@/components/lifeos/LifeOsHero";
import { LifeOsAreasSection } from "@/components/lifeos/LifeOsAreasSection";
import { LifeOsQuickSend } from "@/components/lifeos/LifeOsQuickSend";
import { LifeOsBentoGrid } from "@/components/lifeos/LifeOsBentoGrid";
import { WidgetCard } from "@/components/lifeos/WidgetCard";
import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";
import { TodayTrainingWidget } from "@/components/lifeos/TodayTrainingWidget";
import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";

export const dynamic = "force-dynamic";

/**
 * /lifeos — canonical homepage for the life-OS view.
 *
 * Composition top-to-bottom:
 *   1. Hero — greeting, date, day-summary chips
 *   2. JARVIS quick-send composer
 *   3. Areas tree (centerpiece)
 *   4. Bento grid — Tasks (hero) · Habits · Training · Captures (full-width)
 *
 * All widgets are interactive client islands. They reuse the same TanStack
 * Query keys + Supabase Realtime channels as /habits / /tasks / /captures /
 * /training, so toggles on /lifeos sync downstream without manual refresh.
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

  // Derive summary stats for the hero chips.
  const habitsDone = initialCompletions.filter(
    (c) => c.completedDate === todayISO,
  ).length;
  const habitsTotal = initialHabits.length;
  const openTasks = initialTasks.filter(
    (t) => t.status !== "lesno" && t.dueDate != null,
  );
  const tasksDueToday = openTasks.filter((t) => t.dueDate === todayISO).length;
  const tasksOverdue = openTasks.filter(
    (t) => (t.dueDate as string) < todayISO,
  ).length;
  const visibleTraining = initialTrainingActivities.filter(
    (a) => a.status !== "cancelled" && a.status !== "skipped",
  );
  const trainingPlanned = visibleTraining.length;
  const trainingDone = visibleTraining.filter((a) => a.status === "done").length;

  return (
    <main className="relative min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        <LifeOsHero
          displayName={user.displayName ?? user.email}
          habitsDone={habitsDone}
          habitsTotal={habitsTotal}
          tasksDueToday={tasksDueToday}
          tasksOverdue={tasksOverdue}
          trainingPlanned={trainingPlanned}
          trainingDone={trainingDone}
        />
        <LifeOsQuickSend />
        <LifeOsAreasSection />
        <LifeOsBentoGrid
          hero={
            <WidgetCard href="/tasks" ariaLabel="Open Tasks">
              <UpcomingTasksWidget
                userId={user.id}
                initialTasks={initialTasks}
                limit={7}
              />
            </WidgetCard>
          }
          topRight={
            <WidgetCard href="/habits" ariaLabel="Open Habits">
              <TodayHabitsWidget
                userId={user.id}
                initialHabits={initialHabits}
                initialCompletions={initialCompletions}
                todayISO={todayISO}
              />
            </WidgetCard>
          }
          midRight={
            <WidgetCard href="/training" ariaLabel="Open Training">
              <TodayTrainingWidget
                userId={user.id}
                initialActivities={initialTrainingActivities}
                distanceUnit={distanceUnit}
                todayISO={todayISO}
              />
            </WidgetCard>
          }
          bottom={
            <WidgetCard href="/captures" ariaLabel="Open Captures">
              <RecentCapturesWidget
                userId={user.id}
                initialCaptures={initialCaptures}
                availableProjects={availableProjects}
              />
            </WidgetCard>
          }
        />
      </div>
    </main>
  );
}
