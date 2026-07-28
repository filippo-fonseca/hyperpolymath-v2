import { and, eq, isNull } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { areas } from "@/lib/db/schema";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
  getArchivedHabitsForCurrentUser,
} from "@/app/actions/habits";
import { HabitsClient } from "@/components/habits/HabitsClient";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { HabitIcon } from "@/components/ui/icons";

/**
 * /habits — dashboard for the habits primitive.
 *
 * Habits are a peer of Projects (same hierarchy tier under Areas, M:N to
 * many areas). The page is one document: today's panel at top, every active
 * habit listed below, manage controls inline on each row.
 *
 * Server-fetches:
 *   - full active habit list (joined with area chips)
 *   - completions across the rolling 14-day window so the client can
 *     compute today's status + a short streak without an extra round-trip
 *   - active areas (for the create + edit dialogs' area multi-select)
 */
export default async function HabitsPage() {
  const user = await requireOnboarded();

  // Rolling 14-day window — long enough for a meaningful streak preview,
  // short enough to keep the SSR payload tiny.
  const today = new Date();
  const startWindow = new Date(today);
  startWindow.setDate(today.getDate() - 13);
  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [habits, archived, completions, activeAreas] = await Promise.all([
    getHabitsForCurrentUser(),
    getArchivedHabitsForCurrentUser(),
    getHabitCompletionsInRange(toISODate(startWindow), toISODate(today)),
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
    <main
      className="min-h-full text-[var(--sd-ink)]"
      style={{ background: "var(--sd-app)" }}
    >
      <div className="mx-auto w-full max-w-[1080px] px-8 md:px-12 pt-6 pb-20">
        <Breadcrumbs items={[{ label: "Habits" }]} className="mb-6" />
        <header className="mb-8 flex items-start gap-3.5">
          <span className="inline-flex shrink-0 items-center justify-center pt-0.5">
            <HabitIcon size={30} />
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
              Repetition · Streaks
            </span>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
              Habits<span className="text-[var(--sd-accent)]">.</span>
            </h1>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--sd-ink-dull)]">
              We are what we repeatedly do. Excellence, then, is not an act,
              but a habit.{" "}
              <span className="text-[var(--sd-ink-faint)]">
                — Aristotle (via Will Durant)
              </span>
            </p>
          </div>
        </header>

        <HabitsClient
          userId={user.id}
          initialHabits={habits}
          initialArchived={archived}
          initialCompletions={completions}
          areas={activeAreas}
        />
      </div>
    </main>
  );
}
