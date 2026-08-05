"use client";

import { getTasksForCurrentUser } from "@/app/actions/tasks";
import { DockStateNote } from "@/components/dock-widgets/dock-state";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import { STATUS_DOT, type TaskStatus } from "@/components/tasks/status";
import { entityHref } from "@/lib/entity-href";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { SquareCheck } from "lucide-react";
import Link from "next/link";

/**
 * Today's counts — the first widget through the D11 seam.
 *
 * It owns its data end to end: its own query, its own realtime subscription,
 * its own empty state. The Dock never fetches for it. It reuses the `tasks`
 * table key the app already invalidates on every task mutation, so it stays
 * honest with zero new channels.
 */

type TodayTaskRow = { id: string; title: string; status: TaskStatus };

type TodayCounts = {
  overdue: number;
  today: number;
  /** Up to three of today's open tasks, so the card shows work, not arithmetic. */
  rows: TodayTaskRow[];
  loading: boolean;
};

function todayISO(): string {
  const d = new Date();
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
  const open = (data ?? []).filter((task) => task.status !== "lesno" && task.dueDate != null);
  const dueToday = open.filter((task) => (task.dueDate as string) === iso);

  return {
    overdue: open.filter((task) => (task.dueDate as string) < iso).length,
    today: dueToday.length,
    rows: dueToday
      .slice(0, 3)
      .map((task) => ({ id: task.id, title: task.title, status: task.status as TaskStatus })),
    loading: isPending,
  };
}

/** Pastel stat chip — butter for due-today, rose once anything is overdue. */
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
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-medium tabular-nums transition-[box-shadow] duration-[160ms] ease-out hover:shadow-[var(--shadow-card)] ${
        hue === "butter"
          ? "border-[color-mix(in_srgb,var(--tint-butter-edge)_45%,transparent)] bg-[var(--tint-butter-bg)] text-[var(--tint-butter-ink)]"
          : "border-[color-mix(in_srgb,var(--tint-rose-edge)_45%,transparent)] bg-[var(--tint-rose-bg)] text-[var(--tint-rose-ink)]"
      }`}
    >
      {value} {label}
    </Link>
  );
}

function Compact({ data }: { data: TodayCounts }) {
  if (data.loading) {
    return <DockStateNote>Counting…</DockStateNote>;
  }

  if (data.overdue === 0 && data.today === 0) {
    return (
      <div className="mx-0.5 rounded-lg bg-[var(--tint-sage-bg)] px-2.5 py-1.5 text-micro font-medium text-[var(--tint-sage-ink)]">
        All clear. Nothing due today.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
        {data.today > 0 ? <StatChip value={data.today} label="due today" hue="butter" /> : null}
        {data.overdue > 0 ? <StatChip value={data.overdue} label="overdue" hue="rose" /> : null}
      </div>
      {data.rows.length > 0 ? (
        <div className="flex flex-col">
          {data.rows.map((task) => (
            <Link
              key={task.id}
              // Straight to the task's detail panel (TasksClient nuqs ?task=).
              href={entityHref({ kind: "task", id: task.id })}
              className="flex h-7 min-w-0 items-center gap-2 rounded-lg px-1.5 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: STATUS_DOT[task.status] }}
              />
              <span className="truncate text-meta text-[var(--ink)]">{task.title}</span>
            </Link>
          ))}
          {data.today > data.rows.length ? (
            <Link
              href="/tasks"
              className="rounded-lg px-1.5 py-0.5 text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              +{data.today - data.rows.length} more
            </Link>
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
