import { getHabitCompletionsInRange, getHabitsForCurrentUser } from "@/app/actions/habits";
import { LifeOsAreasSection } from "@/components/lifeos/LifeOsAreasSection";
import { LifeOsBentoGrid } from "@/components/lifeos/LifeOsBentoGrid";
import { LifeOsHero } from "@/components/lifeos/LifeOsHero";
import { LifeOsInsightsWidget } from "@/components/lifeos/LifeOsInsightsWidget";
import { LifeOsQuickSend } from "@/components/lifeos/LifeOsQuickSend";
import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";
import { TodayTrainingWidget } from "@/components/lifeos/TodayTrainingWidget";
import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";
import { WidgetCard } from "@/components/lifeos/WidgetCard";
import { AmbientGlow, FocalOrb } from "@/components/ui/ambient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getInsightsData } from "@/lib/db/queries/insights";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getActivitiesInRange, getDistanceUnit } from "@/lib/db/queries/training";
import { projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
      2,
      "0"
    )}`;
  const todayISO = toISODate(today);

  const [
    initialHabits,
    initialCompletions,
    initialCaptures,
    availableProjects,
    initialTasks,
    initialTrainingActivities,
    distanceUnit,
    insights,
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
    getInsightsData(user.id),
  ]);

  // Derive summary stats for the hero chips.
  const habitsDone = initialCompletions.filter((c) => c.completedDate === todayISO).length;
  const habitsTotal = initialHabits.length;
  const openTasks = initialTasks.filter((t) => t.status !== "lesno" && t.dueDate != null);
  const tasksDueToday = openTasks.filter((t) => t.dueDate === todayISO).length;
  const tasksOverdue = openTasks.filter((t) => (t.dueDate as string) < todayISO).length;
  const visibleTraining = initialTrainingActivities.filter(
    (a) => a.status !== "cancelled" && a.status !== "skipped"
  );
  const trainingPlanned = visibleTraining.length;
  const trainingDone = visibleTraining.filter((a) => a.status === "done").length;

  // Additional stat-strip figures, all derived from data already fetched above
  // (no new queries — oracle Q2). "This week" = the trailing 7 days.
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const capturesThisWeek = initialCaptures.filter(
    (c) => new Date(c.createdAt) >= weekAgo
  ).length;
  const projectsActive = availableProjects.length;

  return (
    <main className="relative min-h-full bg-[var(--sd-app)] text-[var(--sd-ink)]">
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        {/* Hero band: the bold ambient glow + one glossy focal orb sit behind
            the stat strip (D5); the whisper field already runs app-shell-wide.
            The isolate + inset clip keep the bleed from ever shifting layout. */}
        <section className="relative isolate mb-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden isolate"
          >
            <AmbientGlow intensity="bold" anchor="hero" className="absolute inset-0" />
            <FocalOrb size={148} className="absolute right-[4%] top-1" />
          </div>
          <LifeOsHero
            displayName={user.displayName ?? user.email}
            openTasksTotal={openTasks.length}
            tasksDueToday={tasksDueToday}
            tasksOverdue={tasksOverdue}
            habitsDone={habitsDone}
            habitsTotal={habitsTotal}
            capturesThisWeek={capturesThisWeek}
            trainingPlanned={trainingPlanned}
            trainingDone={trainingDone}
            projectsActive={projectsActive}
            jarvisTurns={insights.totalTurns}
          />
        </section>
        <LifeOsQuickSend />
        <LifeOsAreasSection />
        <LifeOsBentoGrid
          hero={
            <WidgetCard href="/tasks" ariaLabel="Open Tasks">
              <UpcomingTasksWidget userId={user.id} initialTasks={initialTasks} limit={7} />
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
        <WidgetCard href="/insights?tab=life" ariaLabel="Open Insights">
          <LifeOsInsightsWidget
            jarvisTurns={insights.totalTurns}
            habitsDone={habitsDone}
            habitsTotal={habitsTotal}
            trainingDone={trainingDone}
            trainingPlanned={trainingPlanned}
          />
        </WidgetCard>
      </div>
    </main>
  );
}
