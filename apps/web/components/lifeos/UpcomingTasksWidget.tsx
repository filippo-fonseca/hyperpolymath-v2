"use client";

import { createTask, getTasksForCurrentUser, updateTaskStatus } from "@/app/actions/tasks";
import { DenseListRow, EmptyState, SectionHeader } from "@/components/spacedrive";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

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
export function UpcomingTasksWidget({ userId, initialTasks, compact = false, limit = 7 }: Props) {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();

  useTableSubscription("tasks", userId);

  const { data: tasksData = initialTasks } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    initialData: initialTasks,
  });

  const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const open = tasksData.filter(
    (t) => t.status !== "lesno" && t.dueDate != null && !checkedOff.has(t.id)
  );

  const overdueCount = open.filter(
    (t) => urgencyOf(t.dueDate as string, todayISO) === "overdue"
  ).length;
  const todayCount = open.filter(
    (t) => urgencyOf(t.dueDate as string, todayISO) === "today"
  ).length;

  const upcoming = open
    .sort(
      (a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime()
    )
    .slice(0, limit);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    const r = await createTask({
      title,
      status: "not started",
      dueDate: todayISO,
      priority: "P3",
      projectIds: [],
    });
    setCreating(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setNewTitle("");
    await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) });
  }

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
      void queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) }).then(() => {
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
    <div className="flex flex-col h-full">
      <SectionHeader
        title={compact ? "Upcoming" : "Upcoming tasks"}
        action={
          <div className="flex items-center gap-3">
            {(overdueCount > 0 || todayCount > 0) && (
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--deck-ink-dull)]">
                {overdueCount > 0 && (
                  <span style={{ color: "var(--ink-coral)" }}>{overdueCount} overdue</span>
                )}
                {overdueCount > 0 && todayCount > 0 ? " · " : ""}
                {todayCount > 0 && (
                  <span style={{ color: "var(--ink-amber)" }}>{todayCount} today</span>
                )}
              </span>
            )}
            <Link
              href="/tasks"
              className="rounded-sm px-1 py-0.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              All →
            </Link>
          </div>
        }
        className="mb-4"
      />

      {/* Inline composer — Enter to create with today's due date. */}
      <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--deck-line)] bg-[var(--deck-panel-deep)] px-3 py-2 transition-colors [transition-duration:var(--dur-hover)] focus-within:border-[var(--deck-accent-faint)]">
        <Plus
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-[var(--deck-ink-dull)]"
          aria-hidden
        />
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="New task — Enter to add"
          disabled={creating}
          className="min-w-0 flex-1 bg-transparent font-[family-name:var(--font-sans)] text-[13px] text-[var(--deck-ink)] outline-none placeholder:text-[var(--deck-ink-dull)] placeholder:italic focus-visible:[box-shadow:var(--ring-focus)]"
        />
        {newTitle.trim() && (
          <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.10em] text-[var(--deck-ink-dull)] tabular-nums">
            ⏎
          </span>
        )}
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing due. Breathe."
          description="New tasks created here land on today's queue."
          className="min-h-0 flex-1 items-start px-0 py-8 text-left"
        />
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
                  layout={!reducedMotion}
                  initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, x: -20 }}
                  transition={transition}
                  className="group/task border-b border-[var(--deck-divider)] last:border-b-0"
                >
                  <DenseListRow
                    glyph={
                      <button
                        type="button"
                        onClick={() => handleCheck(t)}
                        aria-label={`Mark "${t.title}" as done`}
                        className="relative flex h-5 w-5 items-center justify-center rounded-[3px] border cursor-pointer-always transition-colors [transition-duration:var(--dur-hover)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                        style={{
                          borderColor:
                            u === "overdue" || u === "today" ? tone.dot : "var(--deck-line)",
                        }}
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-sm"
                          style={{
                            backgroundColor: checkedOff.has(t.id) ? tone.dot : "transparent",
                          }}
                        />
                      </button>
                    }
                    title={
                      <span className="font-[family-name:var(--font-sans)] text-[13px]">
                        {t.title}
                      </span>
                    }
                    meta={
                      <span
                        className="flex max-w-[42vw] items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] tabular-nums sm:max-w-none"
                        style={{ color: tone.text }}
                      >
                        {project ? (
                          <span className="hidden max-w-[120px] truncate sm:inline">
                            {project.name}
                          </span>
                        ) : null}
                        <span>{tone.label || format(new Date(t.dueDate as string), "MMM d")}</span>
                      </span>
                    }
                    className="h-11 px-2.5"
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
