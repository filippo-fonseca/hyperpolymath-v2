"use client";

import { useState } from "react";
import Link from "next/link";
import { format, differenceInCalendarDays } from "date-fns";
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
  /** When true, widget shrinks header weight to fit a sidekick slot. */
  compact?: boolean;
  /** Max number of rows to render. */
  limit?: number;
}

type Urgency = "overdue" | "today" | "soon" | "later";

function urgencyOf(dueDateISO: string, todayISO: string): Urgency {
  const today = new Date(`${todayISO}T00:00:00`);
  const due = new Date(`${dueDateISO}T00:00:00`);
  const days = differenceInCalendarDays(due, today);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "soon";
  return "later";
}

const urgencyToken: Record<Urgency, { dot: string; text: string; label: string }> = {
  overdue: {
    dot: "var(--ink-coral)",
    text: "var(--ink-coral)",
    label: "OVERDUE",
  },
  today: {
    dot: "var(--ink-amber)",
    text: "var(--ink-amber)",
    label: "TODAY",
  },
  soon: {
    dot: "var(--hud-cyan)",
    text: "var(--hud-cyan)",
    label: "",
  },
  later: {
    dot: "var(--ink-muted)",
    text: "var(--ink-muted)",
    label: "",
  },
};

/**
 * UpcomingTasksWidget — bento hero tile.
 *
 * Reuses tableKey("tasks", userId) verbatim from TasksClient so Realtime
 * invalidation drives both surfaces. Optimistic check-off via local Set;
 * AnimatePresence handles the slide-out. Per-row urgency tint surfaces what
 * matters at a glance — coral for overdue, amber for today, cyan for the
 * coming week, muted for later.
 */
export function UpcomingTasksWidget({
  userId,
  initialTasks,
  compact = false,
  limit = 7,
}: Props) {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();

  useTableSubscription("tasks", userId);

  const { data: tasksData = initialTasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: initialTasks,
  });

  const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set());

  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const open = tasksData.filter(
    (t) => t.status !== "lesno" && t.dueDate != null && !checkedOff.has(t.id),
  );

  const overdueCount = open.filter(
    (t) => urgencyOf(t.dueDate as string, todayISO) === "overdue",
  ).length;
  const todayCount = open.filter(
    (t) => urgencyOf(t.dueDate as string, todayISO) === "today",
  ).length;

  const upcoming = open
    .sort(
      (a, b) =>
        new Date(a.dueDate as string).getTime() -
        new Date(b.dueDate as string).getTime(),
    )
    .slice(0, limit);

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
    : { duration: 0.22, ease: [0.25, 1, 0.5, 1] as const };

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-6 flex flex-col h-full transition-[border-color,transform] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px">
      <header className="mb-5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h3
            className={`font-serif font-semibold text-[var(--ink)] ${compact ? "text-base" : "text-lg"}`}
          >
            Upcoming
          </h3>
          {(overdueCount > 0 || todayCount > 0) && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {overdueCount > 0 && (
                <span style={{ color: "var(--ink-coral)" }}>
                  {overdueCount} overdue
                </span>
              )}
              {overdueCount > 0 && todayCount > 0 ? " · " : ""}
              {todayCount > 0 && (
                <span style={{ color: "var(--ink-amber)" }}>
                  {todayCount} today
                </span>
              )}
            </span>
          )}
        </div>
        <Link
          href="/tasks"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {upcoming.length === 0 ? (
        <div className="flex flex-1 items-center">
          <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
            Nothing due. Breathe.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col flex-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {upcoming.map((t) => {
              const u = urgencyOf(t.dueDate as string, todayISO);
              const tone = urgencyToken[u];
              const project = t.projects?.[0];
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={transition}
                  className="group/task flex items-center gap-3 py-2.5 border-b border-[var(--edge)] last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => handleCheck(t)}
                    aria-label={`Mark "${t.title}" as done`}
                    className="relative flex items-center justify-center w-[16px] h-[16px] rounded-[3px] border shrink-0 cursor-pointer-always transition-colors duration-100"
                    style={{
                      borderColor:
                        u === "overdue" || u === "today"
                          ? tone.dot
                          : "var(--edge)",
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute -left-2 top-1/2 -translate-y-1/2 h-[14px] w-[2px] rounded-sm opacity-0 group-hover/task:opacity-100 transition-opacity duration-100"
                      style={{ backgroundColor: tone.dot }}
                    />
                  </button>
                  <span className="font-serif text-[14px] text-[var(--ink)] flex-1 min-w-0 truncate">
                    {t.title}
                  </span>
                  {project && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--ink-muted)] shrink-0 max-w-[120px] truncate">
                      {project.name}
                    </span>
                  )}
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.10em] shrink-0 tabular-nums"
                    style={{ color: tone.text }}
                  >
                    {tone.label || format(new Date(t.dueDate as string), "MMM d")}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
