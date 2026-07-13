"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createTask,
  getTasksForCurrentUser,
  updateTaskStatus,
} from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { TaskIcon } from "@/components/ui/icons";
import { Chip, EntityCardHeader, StatusPill } from "./entity-card";

/** High-priority tint (15%-alpha chip, D6). P3/P∞ stay untinted / hidden. */
const priorityTone: Partial<Record<TaskWithProjects["priority"], string>> = {
  P1: "var(--ink-coral)",
  P2: "var(--ink-amber)",
};

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
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

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

  const subtitle =
    overdueCount > 0 || todayCount > 0 ? (
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
        {overdueCount > 0 && (
          <span style={{ color: "var(--ink-coral)" }}>{overdueCount} overdue</span>
        )}
        {overdueCount > 0 && todayCount > 0 ? " · " : ""}
        {todayCount > 0 && (
          <span style={{ color: "var(--ink-amber)" }}>{todayCount} today</span>
        )}
      </span>
    ) : (
      `${open.length} scheduled`
    );

  return (
    <div className="flex flex-col h-full">
      <EntityCardHeader
        icon={<TaskIcon size={26} />}
        title="Tasks"
        subtitle={subtitle}
        pill={
          upcoming.length > 0 ? (
            <StatusPill tone="progress" label={`${upcoming.length} due`} />
          ) : (
            <StatusPill tone="idle" label="clear" />
          )
        }
        action={
          <Link
            href="/tasks"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            All →
          </Link>
        }
      />

      {/* Inline composer — Enter to create with today's due date. */}
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 transition-colors duration-150 focus-within:border-[var(--edge-hud)]">
        <Plus
          size={13}
          strokeWidth={1.75}
          className="text-[var(--ink-muted)] shrink-0"
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
          className="flex-1 min-w-0 bg-transparent outline-none font-serif text-[14px] placeholder:text-[var(--ink-muted)] placeholder:italic"
        />
        {newTitle.trim() && (
          <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[var(--ink-muted)] tabular-nums">
            ⏎
          </span>
        )}
      </div>

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
                  <div className="flex items-center gap-1.5 shrink-0">
                    {priorityTone[t.priority] && (
                      <Chip tone={priorityTone[t.priority]}>{t.priority}</Chip>
                    )}
                    {project && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--ink-muted)] max-w-[110px] truncate">
                        {project.name}
                      </span>
                    )}
                    {u === "overdue" || u === "today" ? (
                      <Chip tone={tone.text}>{tone.label}</Chip>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--ink-muted)] tabular-nums">
                        {format(new Date(t.dueDate as string), "MMM d")}
                      </span>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
