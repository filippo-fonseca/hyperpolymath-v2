import { requireOnboarded } from "@/lib/auth/get-user";
import { LifeOsBanner } from "@/components/lifeos/LifeOsBanner";

export const dynamic = "force-dynamic";

/**
 * /lifeos — candidate canonical homepage for the life-OS view.
 *
 * Composition (filled in across subsequent commits in 260607-fgb):
 *   1. Notion-style banner block (emoji + title + cover affordance)  ← live
 *   2. AreasTree as the centerpiece (mirrors /areas data fetch)
 *   3. At-a-glance widget grid: Recent captures · Today's habits · Upcoming tasks
 *
 * The root redirect from `/` for signed-in users is intentionally deferred —
 * the user wants to live with /lifeos as an opt-in tab before flipping the
 * canonical-home switch.
 */
export default async function LifeOsPage() {
  const user = await requireOnboarded();
  // Auth gate is the only side-effect we need from this call right now;
  // subsequent tasks delegate fetches to per-section components.
  void user;

  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        <LifeOsBanner
          title="LifeOS"
          emoji="◈"
          subtitle="One canvas for areas, captures, habits, and tasks."
        />
      </div>
    </main>
  );
}
