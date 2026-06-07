import Link from "next/link";
import { Check, Circle } from "lucide-react";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
} from "@/app/actions/habits";

/**
 * TodayHabitsWidget — at-a-glance tile for the LifeOS homepage.
 *
 * Lists every active habit with a check-state indicator for today.
 * Read-only on this surface — interaction (toggle, manage) happens on
 * /habits, reached via the "All →" link. Keeping it read-only also
 * keeps it a Server Component (no Realtime subscription here).
 *
 * Reuses getHabitsForCurrentUser + getHabitCompletionsInRange from the
 * existing /habits action layer; today's status is derived by joining on
 * habitId + completedDate (matching how HabitsClient does it).
 *
 * Cyan check icon is one of the two sanctioned cyan touches on /lifeos
 * (the other being the banner cover gradient).
 */
export async function TodayHabitsWidget() {
  const today = new Date();
  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const todayISO = toISODate(today);

  const [habits, completions] = await Promise.all([
    getHabitsForCurrentUser(),
    getHabitCompletionsInRange(todayISO, todayISO),
  ]);

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
          Today's habits
        </h3>
        <Link
          href="/habits"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {habits.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          No habits yet. Set one up over on /habits.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 flex-1">
          {habits.map((h) => {
            // Completion shape is { habitId, completedDate: 'YYYY-MM-DD' }
            // per getHabitCompletionsInRange's normalized return.
            const done = completions.some(
              (c) => c.habitId === h.id && c.completedDate === todayISO,
            );
            return (
              <li key={h.id} className="flex items-center gap-2.5">
                {done ? (
                  <Check
                    size={14}
                    strokeWidth={2}
                    className="text-[var(--hud-cyan)] shrink-0"
                  />
                ) : (
                  <Circle
                    size={14}
                    strokeWidth={1.5}
                    className="text-[var(--ink-muted)] shrink-0"
                  />
                )}
                <span
                  className={`font-serif text-[14px] ${
                    done
                      ? "text-[var(--ink-muted)] line-through"
                      : "text-[var(--ink)]"
                  }`}
                >
                  {h.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
