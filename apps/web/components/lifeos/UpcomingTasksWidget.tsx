"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Plus } from "lucide-react";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionLink, EntityCardHeader } from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

/**
 * Only P1 earns color (coral = danger, §6), and only as a tiny dot before the
 * title — never a filled plate. P2 and below stay monochrome.
 */
const priorityDot: Partial<Record<TaskWithProjects["priority"], string>> = {
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

/**
 * Craft's date grammar: the due date is bare colored TEXT, never a chip.
 * Overdue = coral, due today = the warm butter ink (reads like Craft's small
 * orange date stamp), everything else = faint gray.
 */
const dueText: Record<Urgency, { color: string; label: string | null }> = {
  overdue: { color: "var(--ink-coral)", label: "Overdue" },
  today: { color: "var(--tint-butter-ink)", label: "Today" },
  soon: { color: "var(--sd-ink-faint)", label: null },
  later: { color: "var(--sd-ink-faint)", label: null },
};

/**
 * UpcomingTasksWidget — bento hero tile.
 *
 * Reuses tableKey("tasks", userId) verbatim from TasksClient so Realtime
 * invalidation drives both surfaces. Optimistic check-off via local Set;
 * AnimatePresence handles the slide-out. aug-05 quiet pass: rows are
 * monochrome except the due-date stamp (coral overdue, warm today) and the
 * tiny P1 dot — Craft's one-colored-element-per-card discipline.
 *
 * Done tasks don't vanish: they sink into a strikethrough cluster at the
 * bottom (two visible, tail behind "+N more", the whole thing foldable with
 * the fold remembered in localStorage). Its checkboxes un-complete.
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
  // The completed cluster folds away and remembers it; "+N more" is per-visit.
  const [completedHidden, setCompletedHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("lifeos-tasks-completed-hidden") === "1";
  });
  const [showAllCompleted, setShowAllCompleted] = useState(false);

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
    .sort((a, b) => {
      const byDate =
        new Date(a.dueDate as string).getTime() -
        new Date(b.dueDate as string).getTime();
      if (byDate !== 0) return byDate;
      // Same day: timed tasks first, in time order; date-only tasks last.
      if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return 0;
    })
    .slice(0, limit);

  // Done tasks sink to the bottom cluster. Optimistically-checked rows (still
  // pre-invalidate in the cache) lead; the rest order by most recently
  // completed.
  const completed = tasksData
    .filter((t) => t.status === "lesno" || checkedOff.has(t.id))
    .sort((a, b) => {
      const stamp = (t: TaskWithProjects) =>
        checkedOff.has(t.id)
          ? Number.POSITIVE_INFINITY
          : t.completedAt
            ? new Date(t.completedAt).getTime()
            : 0;
      return stamp(b) - stamp(a);
    });
  const visibleCompleted = showAllCompleted ? completed : completed.slice(0, 2);

  function toggleCompletedHidden() {
    setCompletedHidden((prev) => {
      window.localStorage.setItem("lifeos-tasks-completed-hidden", prev ? "0" : "1");
      return !prev;
    });
  }

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

  async function handleUncheck(task: TaskWithProjects) {
    const r = await updateTaskStatus({ id: task.id, newStatus: "not started" });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setCheckedOff((prev) => {
      if (!prev.has(task.id)) return prev;
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
    await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) });
  }

  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.25, 1, 0.5, 1] as const };

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<TaskIcon size={20} />}
          title="Tasks"
          subtitle={`${open.length} scheduled`}
          pill={
            // Bare colored text, never a pill: overdue is the one thing this
            // header is allowed to say in color. Everything else is silence.
            overdueCount > 0 ? (
              <span className="text-micro tabular-nums text-[var(--ink-coral)]">
                {overdueCount} overdue
              </span>
            ) : null
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

        {/* Inline composer — Enter to create with today's due date. aug-05
            quiet pass: a borderless h-7 hover row (Craft's ghost affordance);
            the hairline border appears only while focused, no ring, and the
            kbd hint only shows while the field is focused. */}
        <div className="group/composer mb-1 mt-2 flex h-7 items-center gap-2 rounded-[8px] border border-transparent px-1.5 transition-colors duration-[160ms] hover:bg-[var(--hover)] focus-within:border-[var(--sd-line)] focus-within:bg-transparent">
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
            className="min-w-0 flex-1 bg-transparent text-meta text-[var(--sd-ink)] outline-none placeholder:text-micro placeholder:text-[var(--sd-ink-faint)]"
          />
          <kbd className="hidden font-mono text-micro text-[var(--ink-faint)] group-focus-within/composer:inline">
            ⏎
          </kbd>
        </div>

        {/* One scroll container owns the open list AND the completed cluster —
            never two nested scrollbars. */}
        <div className="sd-scroll-hover -mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
        {upcoming.length === 0 ? (
          <div className="flex min-h-20 flex-1 flex-col justify-center">
            <EmptyState size="inline" title="Nothing due. Breathe." />
          </div>
        ) : (
          <ul className="flex flex-col">
          <AnimatePresence mode="popLayout" initial={false}>
            {upcoming.map((t) => {
              const u = urgencyOf(t.dueDate as string, todayISO);
              const due = dueText[u];
              const project = t.projects?.[0];
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={transition}
                  className="group/task flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--sd-line)_60%,transparent)] py-1.5 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => handleCheck(t)}
                    aria-label={`Mark "${t.title}" as done`}
                    className="relative flex size-3.5 shrink-0 cursor-pointer-always items-center justify-center rounded border border-[var(--sd-line)] transition-colors duration-[160ms] hover:border-[var(--sd-ink-faint)]"
                  >
                    <span
                      aria-hidden
                      className="absolute -left-2 top-1/2 h-[14px] w-[2px] -translate-y-1/2 rounded-sm bg-[var(--sd-ink-faint)] opacity-0 transition-opacity duration-[160ms] group-hover/task:opacity-100"
                    />
                  </button>
                  {priorityDot[t.priority] && (
                    <span
                      aria-hidden
                      title={t.priority}
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: priorityDot[t.priority] }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-meta font-normal text-[var(--sd-ink)]">
                    {t.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {project && (
                      <span className="max-w-[110px] truncate text-micro text-[var(--sd-ink-faint)]">
                        {project.name}
                      </span>
                    )}
                    <span
                      className="text-micro tabular-nums"
                      style={{ color: due.color }}
                    >
                      {due.label ?? format(new Date(t.dueDate as string), "MMM d")}
                      {t.dueTime ? ` \u00b7 ${t.dueTime}` : ""}
                    </span>
                  </div>
                </motion.li>
              );
            })}
            </AnimatePresence>
          </ul>
        )}

        {/* Completed cluster — done tasks sink here, struck through. The
            disclosure folds it away (remembered); "+N more" unfolds the tail. */}
        {completed.length > 0 && (
          <div className="mt-2 shrink-0 border-t border-[color-mix(in_srgb,var(--sd-line)_60%,transparent)] pt-1">
            <button
              type="button"
              onClick={toggleCompletedHidden}
              aria-expanded={!completedHidden}
              className="flex h-6 w-full cursor-pointer-always items-center gap-1 text-micro text-[var(--sd-ink-faint)] transition-colors duration-[160ms] hover:text-[var(--sd-ink-dull)]"
            >
              <ChevronRight
                size={12}
                strokeWidth={1.75}
                aria-hidden
                className={`transition-transform duration-[160ms] ${completedHidden ? "" : "rotate-90"}`}
              />
              <span className="tabular-nums">Completed · {completed.length}</span>
            </button>
            {!completedHidden && (
              <>
                <ul className="flex flex-col">
                  {visibleCompleted.map((t) => (
                    <li key={t.id} className="group/done flex h-6 items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleUncheck(t)}
                        aria-label={`Mark "${t.title}" as not done`}
                        className="flex size-3.5 shrink-0 cursor-pointer-always items-center justify-center rounded border border-transparent bg-[var(--sd-ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--sd-ink-dull)]"
                      >
                        <Check size={9} strokeWidth={2.5} className="text-[var(--sd-box)]" aria-hidden />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-meta font-normal text-[var(--sd-ink-faint)] line-through">
                        {t.title}
                      </span>
                      {t.completedAt && (
                        <span className="shrink-0 text-micro tabular-nums text-[var(--sd-ink-faint)]">
                          {format(new Date(t.completedAt), "MMM d")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {completed.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCompleted((v) => !v)}
                    className="mt-0.5 cursor-pointer-always pl-[22px] text-micro text-[var(--sd-ink-faint)] transition-colors duration-[160ms] hover:text-[var(--sd-ink-dull)]"
                  >
                    {showAllCompleted ? "Less" : `+${completed.length - 2} more`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        </div>
      </WidgetBody>

      {/* Footer — one quiet line; only the due-today count keeps its warmth.
          The header subtitle already says "N scheduled", so the footer only
          renders when it adds something, and drops itself otherwise. */}
      {(todayCount > 0 || open.length > upcoming.length) && (
        <WidgetFooter>
          <span className="truncate text-micro tabular-nums text-[var(--sd-ink-faint)]">
            {todayCount > 0 && (
              <span className="text-[var(--tint-butter-ink)]">{todayCount} today</span>
            )}
            {todayCount > 0 && open.length > upcoming.length && " · "}
            {open.length > upcoming.length && `+${open.length - upcoming.length} more`}
          </span>
        </WidgetFooter>
      )}
    </>
  );
}
