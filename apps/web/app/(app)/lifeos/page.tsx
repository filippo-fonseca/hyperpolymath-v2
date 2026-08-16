import { getHabitCompletionsInRange, getHabitsForCurrentUser } from "@/app/actions/habits";
import { LifeOsAreasSection } from "@/components/lifeos/LifeOsAreasSection";
import { LifeOsBentoGrid } from "@/components/lifeos/LifeOsBentoGrid";
import { LifeOsCanvas } from "@/components/lifeos/LifeOsCanvas";
import { LifeOsHero } from "@/components/lifeos/LifeOsHero";
import { LifeOsInsightsWidget } from "@/components/lifeos/LifeOsInsightsWidget";
import { LifeOsNodeField } from "@/components/lifeos/LifeOsNodeField";
import { LifeOsQuickSend } from "@/components/lifeos/LifeOsQuickSend";
import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";
import { TodayReviewWidget } from "@/components/lifeos/TodayReviewWidget";
import { TodayTrainingWidget } from "@/components/lifeos/TodayTrainingWidget";
import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";
import { WidgetCard } from "@/components/lifeos/WidgetCard";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getInsightsData } from "@/lib/db/queries/insights";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getActivitiesInRange, getDistanceUnit } from "@/lib/db/queries/training";
import { projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * /lifeos — canonical homepage for the life-OS view.
 *
 * One-screen command deck (UI-CONTRACT-SD3 §2). Hero + quick-send stay pinned
 * at the top; a two-segment toggle (Widgets / Areas) swaps a single fixed
 * region so the page fits one viewport and never scrolls:
 *   - Widgets: a fixed 2-row · 12-col bento — Tasks (tall) · Habits · Training
 *     · Captures · Insights (folded in as a compact cell).
 *   - Areas: the full areas tree, with its own internal scroll.
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

  // Derive summary stats for the hero chips. Habits are counted against
  // TODAY'S schedule, not the whole roster: a Mon/Wed/Fri habit is not a
  // Sunday failure, and only `done` earns credit (a partial rung has a
  // completion row too, but it is momentum, not completion).
  const todayDow = today.getDay();
  const habitsDueToday = initialHabits.filter((h) => h.daysOfWeek[todayDow]);
  const dueTodayIds = new Set(habitsDueToday.map((h) => h.id));
  const habitsDone = initialCompletions.filter(
    (c) => c.completedDate === todayISO && c.status === "done" && dueTodayIds.has(c.habitId)
  ).length;
  const habitsTotal = habitsDueToday.length;
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

  // `isolate` on <main> is load-bearing: the node-field backdrop is `absolute
  // -z-10`, and without a stacking context here it escapes to the cockpit
  // root and paints BEHIND the stage sheet's opaque fill (which is exactly
  // what happened when .craft-sheet landed). Isolation pins it above this
  // main's ancestors and below its content.
  return (
    <main className="relative isolate h-full text-[var(--sd-ink)]">
      {/* One-screen command deck (UI-CONTRACT-SD3 §2): hero + quick-send stay
          pinned; a two-segment toggle swaps the widget deck vs the areas tree
          into a single fixed region. The page never scrolls — the canvas is
          h-full against the AppShell scroll container and clips.

          The opaque --sd-app fill is gone: the ambient node field owns the
          background over the stage sheet's fill, and `relative` scopes its
          absolute -z layer to this route region (the field belongs to /lifeos
          only — aug-05, it retired the D5 space-loop video). */}
      <LifeOsNodeField />
      <LifeOsCanvas
        hero={
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
        }
        quickSend={<LifeOsQuickSend />}
        widgets={
          <LifeOsBentoGrid
            hero={
              <WidgetCard href="/tasks" ariaLabel="Open Tasks">
                <UpcomingTasksWidget userId={user.id} initialTasks={initialTasks} limit={7} />
              </WidgetCard>
            }
            review={
              <WidgetCard href="/review" ariaLabel="Open Review">
                <TodayReviewWidget userId={user.id} todayISO={todayISO} />
              </WidgetCard>
            }
            habits={
              <WidgetCard href="/habits" ariaLabel="Open Habits">
                <TodayHabitsWidget
                  userId={user.id}
                  initialHabits={initialHabits}
                  initialCompletions={initialCompletions}
                  todayISO={todayISO}
                />
              </WidgetCard>
            }
            training={
              <WidgetCard href="/training" ariaLabel="Open Training">
                <TodayTrainingWidget
                  userId={user.id}
                  initialActivities={initialTrainingActivities}
                  distanceUnit={distanceUnit}
                  todayISO={todayISO}
                />
              </WidgetCard>
            }
            captures={
              <WidgetCard href="/captures" ariaLabel="Open Captures">
                <RecentCapturesWidget
                  userId={user.id}
                  initialCaptures={initialCaptures}
                  availableProjects={availableProjects}
                />
              </WidgetCard>
            }
            insights={
              <WidgetCard href="/insights?tab=life" ariaLabel="Open Insights">
                <LifeOsInsightsWidget
                  jarvisTurns={insights.totalTurns}
                  habitsDone={habitsDone}
                  habitsTotal={habitsTotal}
                  trainingDone={trainingDone}
                  trainingPlanned={trainingPlanned}
                />
              </WidgetCard>
            }
          />
        }
        areas={<LifeOsAreasSection />}
      />
    </main>
  );
}
