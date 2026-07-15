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
import {
  ActionLink,
  Chip,
  EmptyState,
  EntityCardHeader,
  OverflowChip,
  StatusPill,
} from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

/**
 * Only P1 earns a tint (coral = danger, §6). P2 and below fall back to the
 * neutral Pill grammar: §9 permits exactly one accent hue, so amber is out.
 */
const priorityTone: Partial<Record<TaskWithProjects["priority"], string>> = {
  P1: "var(--ink-coral)",
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
    dot: "var(--hud-cyan)",
    text: "var(--hud-cyan)",
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
 * matters at a glance — coral for overdue, cyan for today and the coming week,
 * muted for later. One accent hue only (§9).
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

  const subtitle = `${open.length} scheduled`;

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<TaskIcon size={36} />}
          title="Tasks"
          subtitle={subtitle}
          pill={
            overdueCount > 0 ? (
              <StatusPill tone="danger" label={`${overdueCount} overdue`} />
            ) : upcoming.length > 0 ? (
              <StatusPill tone="progress" label={`${upcoming.length} due`} />
            ) : (
              <StatusPill tone="idle" label="clear" />
            )
          }
          action={
            <Link
              href="/tasks"
              className="group/action cursor-pointer-always"
            >
              <ActionLink>All →</ActionLink>
            </Link>
          }
        />

        {/* Inline composer — Enter to create with today's due date. */}
        <div className="mb-1 mt-3.5 flex items-center gap-2 rounded-[10px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-3 py-2 transition-colors duration-150 focus-within:border-[color-mix(in_srgb,var(--sd-accent)_40%,var(--sd-line))]">
          <Plus
            size={13}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--sd-ink-faint)]"
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
            placeholder="New task, Enter to add"
            disabled={creating}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--sd-ink)] outline-none placeholder:text-[var(--sd-ink-faint)]"
          />
          {newTitle.trim() && (
            <span className="font-mono text-[9px] uppercase tracking-[0.10em] tabular-nums text-[var(--sd-ink-faint)]">
              ⏎
            </span>
          )}
        </div>

        {upcoming.length === 0 ? (
          <EmptyState icon={<TaskIcon size={40} />}>Nothing due. Breathe.</EmptyState>
        ) : (
          <ul className="flex flex-1 flex-col">
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
                  className="group/task flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--sd-line)_60%,transparent)] py-2.5 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => handleCheck(t)}
                    aria-label={`Mark "${t.title}" as done`}
                    className="relative flex size-4 shrink-0 cursor-pointer-always items-center justify-center rounded-[3px] border transition-colors duration-100"
                    style={{
                      borderColor:
                        u === "overdue" || u === "today" ? tone.dot : "var(--sd-line)",
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute -left-2 top-1/2 h-[14px] w-[2px] -translate-y-1/2 rounded-sm opacity-0 transition-opacity duration-100 group-hover/task:opacity-100"
                      style={{ backgroundColor: tone.dot }}
                    />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--sd-ink)]">
                    {t.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {priorityTone[t.priority] && (
                      <Chip tone={priorityTone[t.priority]}>{t.priority}</Chip>
                    )}
                    {project && (
                      <span className="max-w-[110px] truncate text-[12px] text-[var(--sd-ink-faint)]">
                        {project.name}
                      </span>
                    )}
                    {u === "overdue" || u === "today" ? (
                      <Chip tone={tone.text}>{tone.label}</Chip>
                    ) : (
                      <span className="text-[12px] tabular-nums text-[var(--sd-ink-faint)]">
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
      </WidgetBody>

      {/* §11 footer chip strip — the card's counts live here, hairline-separated. */}
      <WidgetFooter>
        <Chip>{open.length} scheduled</Chip>
        {overdueCount > 0 && (
          <Chip tone="var(--ink-coral)">{overdueCount} overdue</Chip>
        )}
        {todayCount > 0 && <Chip tone="var(--hud-cyan)">{todayCount} today</Chip>}
        {open.length > upcoming.length && (
          <OverflowChip count={open.length - upcoming.length} />
        )}
      </WidgetFooter>
    </>
  );
}
