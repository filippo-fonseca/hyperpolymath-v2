"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getTasksForCurrentUser,
  updateTaskStatus,
} from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";

interface Props {
  userId: string;
  initialTasks: TaskWithProjects[];
}

/**
 * UpcomingTasksWidget — at-a-glance + interactive tile for the LifeOS homepage.
 *
 * Quick task 260607-gox (3/3): converted from Server Component to client island.
 * Reuses tableKey("tasks", userId) verbatim from TasksClient so Realtime
 * invalidation drives both surfaces.
 *
 * Notion-style 14px square checkbox per row. Tap → optimistic slide-out via
 * AnimatePresence + motion/react, then updateTaskStatus({ newStatus: "lesno" }),
 * then invalidate so the next pending task fills the slot.
 */
export function UpcomingTasksWidget({ userId, initialTasks }: Props) {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();

  useTableSubscription("tasks", userId);

  const { data: tasksData = initialTasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: initialTasks,
  });

  const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set());

  const upcoming = tasksData
    .filter(
      (t) =>
        t.status !== "lesno" && t.dueDate != null && !checkedOff.has(t.id),
    )
    .sort(
      (a, b) =>
        new Date(a.dueDate as string).getTime() -
        new Date(b.dueDate as string).getTime(),
    )
    .slice(0, 5);

  async function handleCheck(task: TaskWithProjects) {
    setCheckedOff((prev) => new Set(prev).add(task.id));

    const r = await updateTaskStatus({ id: task.id, newStatus: "lesno" });

    if (!r.success) {
      setCheckedOff((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      toast.error(r.error);
      return;
    }

    if (r.data.becameLesno) toast("Lesno.");

    // Let the exit animation settle before refetching so the slot swap
    // feels like one motion (slide-out → reflow → next task lands).
    setTimeout(() => {
      void queryClient
        .invalidateQueries({ queryKey: tableKey("tasks", userId) })
        .then(() => {
          setCheckedOff((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
        });
    }, 250);
  }

  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.25, 1, 0.5, 1] as const };

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
          <AnimatePresence mode="popLayout" initial={false}>
            {upcoming.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 1, x: 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={transition}
                className="flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => handleCheck(t)}
                  aria-label={`Mark "${t.title}" as done`}
                  className="flex items-center justify-center w-[14px] h-[14px] rounded-sm border border-[var(--edge)] hover:border-[var(--edge-hud)] transition-colors duration-100 shrink-0 cursor-pointer-always"
                />
                <span className="font-serif text-[14px] text-[var(--ink)] truncate flex-1 min-w-0">
                  {t.title}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] shrink-0">
                  {format(new Date(t.dueDate as string), "MMM d")}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
