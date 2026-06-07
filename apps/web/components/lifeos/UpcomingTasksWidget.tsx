import Link from "next/link";
import { format } from "date-fns";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";

/**
 * UpcomingTasksWidget — at-a-glance tile for the LifeOS homepage.
 *
 * Next 5 tasks by ascending due date. Reuses getAllTasksForUser — the
 * same fetch /tasks uses — and filters/sorts at the widget boundary so
 * no new query function is invented.
 *
 * Field names per lib/db/queries/tasks.ts TaskWithProjects:
 *   - title (NOT `name`)
 *   - dueDate is `string | null` (ISO date already)
 *   - status: "lesno" is the completed terminal state
 */
export async function UpcomingTasksWidget() {
  const user = await requireOnboarded();
  const allTasks = await getAllTasksForUser(user.id);

  // Upcoming = not completed AND has a due date, sorted ascending by due.
  const upcoming = allTasks
    .filter((t) => t.status !== "lesno" && t.dueDate != null)
    .sort(
      (a, b) =>
        new Date(a.dueDate as string).getTime() -
        new Date(b.dueDate as string).getTime(),
    )
    .slice(0, 5);

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full transition-[border-color,transform] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
          Upcoming tasks
        </h3>
        <Link
          href="/tasks"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {upcoming.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          Nothing due. Breathe.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 flex-1">
          {upcoming.map((t) => (
            <li
              key={t.id}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="font-serif text-[14px] text-[var(--ink)] truncate flex-1 min-w-0">
                {t.title}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] shrink-0">
                {format(new Date(t.dueDate as string), "MMM d")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
