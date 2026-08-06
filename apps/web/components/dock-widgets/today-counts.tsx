"use client";

import { getTasksForCurrentUser, updateTaskStatus } from "@/app/actions/tasks";
import { DockStateNote } from "@/components/dock-widgets/dock-state";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import { STATUS_DOT, type TaskStatus } from "@/components/tasks/status";
import { entityHref } from "@/lib/entity-href";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, SquareCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Today's counts — the first widget through the D11 seam.
 *
 * It owns its data end to end: its own query, its own realtime subscription,
 * its own empty state. The Dock never fetches for it. It reuses the `tasks`
 * table key the app already invalidates on every task mutation, so it stays
 * honest with zero new channels.
 *
 * aug-05: rows became checkable. Checking marks the task lesno with the same
 * optimistic grammar as the LifeOS UpcomingTasksWidget (same server action,
 * same table key, same "Lesno." toast), and done work sinks into a quiet
 * strikethrough cluster at the bottom instead of vanishing.
 */

type TodayTaskRow = { id: string; title: string; status: TaskStatus };

type TodayCounts = {
  userId: string;
  overdue: number;
  /** ALL of today's open tasks (Compact slices; optimism needs the full set). */
  dueToday: TodayTaskRow[];
  /** Tasks completed today (status lesno, completedAt today). */
  completedToday: TodayTaskRow[];
  loading: boolean;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function localDayISO(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function useTodayCounts(): TodayCounts {
  const userId = useCurrentUserId() ?? "";
  useTableSubscription("tasks", userId);

  const { data, isPending } = useQuery({
    queryKey: tableKey("tasks", userId),
    queryFn: getTasksForCurrentUser,
    enabled: Boolean(userId),
  });

  const iso = todayISO();
  const all = data ?? [];
  const open = all.filter((task) => task.status !== "lesno" && task.dueDate != null);

  const toRow = (task: (typeof all)[number]): TodayTaskRow => ({
    id: task.id,
    title: task.title,
    status: task.status as TaskStatus,
  });

  return {
    userId,
    overdue: open.filter((task) => (task.dueDate as string) < iso).length,
    dueToday: open.filter((task) => (task.dueDate as string) === iso).map(toRow),
    // The same query already carries lesno rows — no new fetch path, just a
    // second filter over it for "finished today".
    completedToday: all
      .filter((task) => task.status === "lesno" && task.completedAt != null)
      .filter((task) => localDayISO(task.completedAt as Date) === iso)
      .map(toRow),
    loading: isPending,
  };
}

/**
 * Stat count — bare colored TEXT, no pill (aug-05 quiet pass). Butter for
 * due-today, rose once anything is overdue; hover only firms the opacity.
 */
function StatChip({
  value,
  label,
  hue,
}: {
  value: number;
  label: string;
  hue: "butter" | "rose";
}) {
  return (
    <Link
      href="/tasks"
      className={`inline-flex items-center gap-1 text-micro font-medium tabular-nums opacity-90 transition-opacity duration-[160ms] ease-out hover:opacity-100 ${
        hue === "butter" ? "text-[var(--tint-butter-ink)]" : "text-[var(--tint-rose-ink)]"
      }`}
    >
      {value} {label}
    </Link>
  );
}

/**
 * The LifeOS checkbox recipe scaled to the dock: size-3, hairline border,
 * hover darkens the border only. Checked = filled with a tiny check; clicking
 * a checked one un-completes.
 */
function TaskCheckbox({
  title,
  done,
  onClick,
}: {
  title: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
      className={cn(
        "flex size-3 shrink-0 cursor-pointer-always items-center justify-center rounded border transition-colors duration-[160ms] ease-out",
        done
          ? "border-[var(--ink-faint)] bg-[var(--ink-faint)] text-[var(--surface)]"
          : "border-[var(--edge-strong)] hover:border-[var(--ink-faint)]"
      )}
    >
      {done ? <Check size={8} strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

const VISIBLE_OPEN = 3;
const VISIBLE_DONE = 2;

function Compact({ data }: { data: TodayCounts }) {
  const queryClient = useQueryClient();
  // Optimistic status overrides: true = just checked, false = just unchecked.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [clusterOpen, setClusterOpen] = useState(true);
  const [showAllDone, setShowAllDone] = useState(false);

  const clearOverride = (id: string) =>
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

  async function setDone(row: TodayTaskRow, done: boolean) {
    setOverrides((prev) => new Map(prev).set(row.id, done));

    const r = await updateTaskStatus({
      id: row.id,
      newStatus: done ? "lesno" : "not started",
    });

    if (!r.success) {
      clearOverride(row.id);
      toast.error(r.error);
      return;
    }

    if (done && r.data.becameLesno) toast("Lesno.");

    // Small beat so the row is seen landing in the cluster before refetch
    // (same 250ms grammar as UpcomingTasksWidget.handleCheck).
    setTimeout(
      () => {
        void queryClient
          .invalidateQueries({ queryKey: tableKey("tasks", data.userId) })
          .then(() => clearOverride(row.id));
      },
      done ? 250 : 0
    );
  }

  if (data.loading) {
    return <DockStateNote>Counting…</DockStateNote>;
  }

  const openRows = data.dueToday.filter((row) => overrides.get(row.id) !== true);
  const doneRows = [
    // Optimistically checked rows land first, then today's settled lesnos.
    ...data.dueToday.filter((row) => overrides.get(row.id) === true),
    ...data.completedToday.filter((row) => overrides.get(row.id) !== false),
  ].filter((row, i, arr) => arr.findIndex((r) => r.id === row.id) === i);

  const todayCount = openRows.length;

  if (data.overdue === 0 && todayCount === 0 && doneRows.length === 0) {
    // Same quiet-state recipe as every other widget (aug-05: the saturated
    // sage plate read louder than the information deserved).
    return <DockStateNote>All clear. Nothing due today.</DockStateNote>;
  }

  const visibleOpen = openRows.slice(0, VISIBLE_OPEN);
  const visibleDone = showAllDone ? doneRows : doneRows.slice(0, VISIBLE_DONE);

  return (
    <div className="flex flex-col gap-1">
      {data.overdue > 0 || todayCount > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-1.5">
          {todayCount > 0 ? <StatChip value={todayCount} label="due today" hue="butter" /> : null}
          {data.overdue > 0 ? <StatChip value={data.overdue} label="overdue" hue="rose" /> : null}
        </div>
      ) : null}

      {visibleOpen.length > 0 ? (
        <ul className="flex flex-col">
          {visibleOpen.map((task) => (
            <li
              key={task.id}
              className="flex h-7 min-w-0 items-center gap-2 rounded-lg px-1.5 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
            >
              <TaskCheckbox title={task.title} done={false} onClick={() => void setDone(task, true)} />
              <Link
                // Straight to the task's detail panel (TasksClient nuqs ?task=).
                href={entityHref({ kind: "task", id: task.id })}
                className="flex h-full min-w-0 flex-1 items-center gap-2"
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: STATUS_DOT[task.status] }}
                />
                <span className="truncate text-meta text-[var(--ink)]">{task.title}</span>
              </Link>
            </li>
          ))}
          {todayCount > visibleOpen.length ? (
            <li>
              <Link
                href="/tasks"
                className="block rounded-lg px-1.5 py-0.5 text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              >
                +{todayCount - visibleOpen.length} more
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      {doneRows.length > 0 ? (
        <div className="mt-0.5 border-t border-[color-mix(in_srgb,var(--edge-strong)_60%,transparent)] pt-0.5">
          <button
            type="button"
            onClick={() => setClusterOpen((v) => !v)}
            aria-expanded={clusterOpen}
            className="flex h-6 w-full cursor-pointer-always items-center gap-1 rounded-lg px-1.5 text-left text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
          >
            <ChevronRight
              size={10}
              strokeWidth={2}
              aria-hidden
              className={cn(
                "shrink-0 transition-transform duration-[160ms] ease-out",
                clusterOpen && "rotate-90"
              )}
            />
            <span className="tabular-nums">Completed · {doneRows.length}</span>
          </button>
          {clusterOpen ? (
            <ul className="flex flex-col">
              {visibleDone.map((task) => (
                <li
                  key={task.id}
                  className="flex h-6 min-w-0 items-center gap-2 rounded-lg px-1.5 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
                >
                  <TaskCheckbox
                    title={task.title}
                    done
                    onClick={() => void setDone(task, false)}
                  />
                  <Link
                    href={entityHref({ kind: "task", id: task.id })}
                    className="flex h-full min-w-0 flex-1 items-center"
                  >
                    <span className="truncate text-meta text-[var(--ink-faint)] line-through">
                      {task.title}
                    </span>
                  </Link>
                </li>
              ))}
              {doneRows.length > VISIBLE_DONE ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllDone((v) => !v)}
                    className="block w-full cursor-pointer-always rounded-lg px-1.5 py-0.5 text-left text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  >
                    {showAllDone ? "Show fewer" : `+${doneRows.length - VISIBLE_DONE} more`}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const todayCountsWidget = defineDockWidget<TodayCounts>({
  id: "today-counts",
  title: "Today",
  defaultDocked: true,
  order: 10,
  useData: useTodayCounts,
  Compact,
  icon: SquareCheck,
  tint: "tint-sky",
});
