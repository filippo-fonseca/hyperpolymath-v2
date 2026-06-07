import { LifeOsBanner } from "@/components/lifeos/LifeOsBanner";
import { LifeOsAreasSection } from "@/components/lifeos/LifeOsAreasSection";
import { LifeOsWidgetGrid } from "@/components/lifeos/LifeOsWidgetGrid";
import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";
import { UpcomingTasksWidget } from "@/components/lifeos/UpcomingTasksWidget";

export const dynamic = "force-dynamic";

/**
 * /lifeos — candidate canonical homepage for the life-OS view.
 *
 * Composition top-to-bottom:
 *   1. Notion-style banner block (emoji + title + cover affordance)
 *   2. AreasTree as the centerpiece (mirrors /areas data fetch)
 *   3. At-a-glance widget grid: Recent captures · Today's habits · Upcoming tasks
 *
 * Each section component owns its own auth gate via requireOnboarded() so
 * page.tsx stays a thin orchestrator. The root redirect from `/` for
 * signed-in users is intentionally deferred — the user wants to live with
 * /lifeos as an opt-in tab before flipping the canonical-home switch.
 *
 * TODO(lifeos-root-redirect): user confirmation pending — see Quick 260607-fgb step 9.
 */
export default async function LifeOsPage() {
  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        <LifeOsBanner
          title="LifeOS"
          emoji="◈"
          subtitle="One canvas for areas, captures, habits, and tasks."
        />
        <LifeOsAreasSection />
        <LifeOsWidgetGrid>
          <RecentCapturesWidget />
          <TodayHabitsWidget />
          <UpcomingTasksWidget />
        </LifeOsWidgetGrid>
      </div>
    </main>
  );
}
