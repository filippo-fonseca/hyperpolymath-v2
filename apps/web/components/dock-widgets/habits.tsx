"use client";

import { getHabitCompletionsInRange } from "@/app/actions/habits";
import { DockStateNote } from "@/components/dock-widgets/dock-state";
import { HabitQuickStatus } from "@/components/habits/HabitQuickStatus";
import { HabitStatusRingVisual } from "@/components/habits/HabitStatusRing";
import { useHabitDay, useHabitMeta } from "@/components/habits/use-habit-data";
import { useLocalToday } from "@/components/habits/use-local-today";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import { addDaysISO, dayOfWeekISO } from "@/lib/habits/dates";
import { HABIT_STATUS_LABEL, type HabitStatus, habitStatusActionLabel } from "@/lib/habits/status";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Flame, Repeat } from "lucide-react";

import Link from "next/link";
import { useState } from "react";

/**
 * Habits — today's loop in the dock, so checking off costs zero navigation
 * (D12). Registered through the D11 seam: this file plus one manifest line,
 * zero shell edits.
 *
 * It shares EVERYTHING with /habits: the same `toggleHabitCompletion`
 * mutation, the same per-day completions cache entry (also shared with the
 * LifeOS tile), the same streak source, via the hooks in
 * `components/habits/use-habit-data.ts`. The two surfaces cannot disagree.
 *
 * The list is server-filtered to habits actually scheduled today
 * (`getHabitDockToday`), so a Monday-only habit can never show on a Sunday or
 * drag the count down — the old TodayHabitsWidget defect. Midnight rollover is
 * a real timer (`useLocalToday`), not a focus listener: this widget sits on
 * screen all day.
 */

type HabitsDockRow = {
  id: string;
  name: string;
  daysOfWeek: boolean[];
  status: HabitStatus;
  done: boolean;
  /** Current streak (base + today's credit), from day 1. */
  streak: number;
  saturated: boolean;
};

type HabitsDockData = {
  loading: boolean;
  userId: string;
  todayISO: string;
  rows: HabitsDockRow[];
  doneCount: number;
  bestStreak: number;
  bestSaturated: boolean;
  /** Live 28-day completion rate (today folded in), null with no schedule. */
  ratePct: number | null;
  allDone: boolean;
  /** Advance one rung on the ladder (the ring's tap handler). */
  advance: (habitId: string) => void;
  /** Jump straight to a rung — the quick chips' handler. */
  setStatus: (habitId: string, next: HabitStatus) => void;
  /** Binary un-check, used by the Completed cluster. */
  toggle: (habitId: string) => void;
};

function useHabitsDock(): HabitsDockData {
  const userId = useCurrentUserId() ?? "";
  const today = useLocalToday();
  const enabled = Boolean(userId);

  useTableSubscription("habits", userId, { enabled });
  useTableSubscription("habit_completions", userId, { enabled });

  const { data: meta, isPending } = useHabitMeta(userId, today, undefined, {
    enabled,
  });
  const { doneSet, statusOf, advance, setStatus, toggle } = useHabitDay(
    userId,
    today,
    today,
    undefined,
    { enabled }
  );

  const scheduled = (meta?.habits ?? []).filter((h) => h.scheduledToday);
  const rows: HabitsDockRow[] = scheduled.map((h) => {
    const status = statusOf(h.id);
    const done = status === "done";
    return {
      id: h.id,
      name: h.name,
      daysOfWeek: h.daysOfWeek,
      status,
      done,
      streak: h.streakBase + (done ? 1 : 0),
      saturated: h.streakSaturated,
    };
  });
  const doneCount = rows.filter((r) => r.done).length;

  let bestStreak = 0;
  let bestSaturated = false;
  for (const h of meta?.habits ?? []) {
    const streak = h.streakBase + (h.scheduledToday && doneSet.has(h.id) ? 1 : 0);
    if (streak > bestStreak) {
      bestStreak = streak;
      bestSaturated = h.streakSaturated;
    }
  }

  const rateScheduled = (meta?.rate28.scheduled ?? 0) + rows.length;
  const ratePct =
    meta && rateScheduled > 0
      ? Math.round(((meta.rate28.done + doneCount) / rateScheduled) * 100)
      : null;

  return {
    loading: isPending || !userId,
    userId,
    todayISO: today,
    rows,
    doneCount,
    bestStreak,
    bestSaturated,
    ratePct,
    allDone: rows.length > 0 && doneCount === rows.length,
    advance,
    setStatus,
    toggle,
  };
}

/**
 * Remaining, streak and rate in one line — legible without interaction.
 * aug-05 tighten: one text-micro faint line, no icon, no ink shift; the
 * DoneBar right below already celebrates completion.
 */
function StatsLine({ data }: { data: HabitsDockData }) {
  const parts: string[] = [];
  parts.push(
    data.allDone
      ? `All ${data.rows.length} done`
      : `${data.rows.length - data.doneCount} of ${data.rows.length} left`
  );
  if (data.bestStreak > 0) {
    parts.push(`best ${data.bestStreak}${data.bestSaturated ? "+" : ""}`);
  }
  if (data.ratePct !== null) parts.push(`${data.ratePct}%`);

  return (
    <p className="px-1.5 text-micro tabular-nums text-[var(--ink-faint)]">{parts.join(" · ")}</p>
  );
}

function HabitRow({
  row,
  onAdvance,
  onSetStatus,
  trail,
}: {
  row: HabitsDockRow;
  onAdvance: () => void;
  /** Jump straight to a rung from the quick chips. */
  onSetStatus: (next: HabitStatus) => void;
  /** Optional last-7-days dots (Expanded only). */
  trail?: { done: boolean; scheduled: boolean }[];
}) {
  const partial = row.status === "in_progress" || row.status === "almost_done";
  return (
    // The row is a flex shell rather than one big button: the tap target still
    // spans everything that is not a chip, but the quick rungs need to be real
    // buttons and a button inside a button is invalid HTML.
    <div
      className={cn(
        // aug-05 quiet pass: h-7 exact for the single-line row (no leftover
        // py); the expanded trail adds a second line, so only that variant
        // keeps min-h plus breathing room.
        "group/habit flex w-full items-center gap-1 rounded-lg pr-1 pl-1.5 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]",
        trail ? "min-h-7 py-0.5" : "h-7",
        // The habit's own pastel — same hue this habit wears on /habits.
        tintFor(row.id)
      )}
    >
    <button
      type="button"
      onClick={onAdvance}
      aria-label={habitStatusActionLabel(row.name, row.status)}
      title={habitStatusActionLabel(row.name, row.status)}
      className="flex min-w-0 flex-1 cursor-pointer-always items-center gap-2 text-left"
    >
      <HabitStatusRingVisual
        status={row.status}
        size="sm"
        className="group-hover/habit:opacity-90"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-meta",
            row.done ? "text-[var(--ink-faint)] line-through" : "text-[var(--ink)]"
          )}
        >
          {row.name}
          {partial ? (
            <span className="ml-1.5 text-micro text-[var(--ink-faint)]">
              {HABIT_STATUS_LABEL[row.status]}
            </span>
          ) : null}
        </span>
        {trail ? (
          <span
            className="mt-1 flex items-center gap-1"
            aria-label={`Last 7 days: ${trail.filter((t) => t.done).length} of ${trail.filter((t) => t.scheduled).length} scheduled days done`}
          >
            {trail.map((t, i) => (
              <span
                // Positional by design: one dot per trailing day.
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-slot trail
                key={i}
                aria-hidden
                className="inline-block size-1.5 rounded-full"
                style={
                  t.done
                    ? { background: "var(--tint-edge)" }
                    : t.scheduled
                      ? {
                          border:
                            "1px solid color-mix(in srgb, var(--tint-edge) 55%, var(--edge-strong))",
                        }
                      : { background: "var(--hover)" }
                }
              />
            ))}
          </span>
        ) : null}
      </span>
      {row.streak > 0 ? (
        <span
          className="flex shrink-0 items-center gap-1 text-micro tabular-nums"
          style={{ color: "var(--ink-amber)" }}
          aria-label={`${row.streak}${row.saturated ? "+" : ""} day streak`}
        >
          <Flame size={10} aria-hidden />
          {row.streak}
          {row.saturated ? "+" : ""}
        </span>
      ) : null}
    </button>

      {/* Icon-only here: the dock has no room for labels, and tapping the row
          already walks the ladder — these are the shortcut past it. Revealed
          on hover so the compact widget stays calm, but a rung already in
          effect stays visible so the row never lies about its own state. */}
      <HabitQuickStatus
        habitName={row.name}
        status={row.status}
        onSetStatus={onSetStatus}
        showLabels={false}
        className={cn(
          "transition-opacity duration-[160ms]",
          partial
            ? "opacity-100"
            : "opacity-0 group-hover/habit:opacity-100 focus-within:opacity-100"
        )}
      />
    </div>
  );
}

/**
 * Done habits sink here — the same quiet cluster grammar as the Today
 * widget: hairline separator, "Completed · N" disclosure, two visible rows,
 * the rest behind "+N more". Rows stay checkable (tap un-completes via the
 * exact same shared toggle), h-6, strikethrough, no flame — done work has
 * nothing left to prove.
 */
function CompletedCluster({
  rows,
  toggle,
}: {
  rows: HabitsDockRow[];
  toggle: (habitId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, 2);

  return (
    <div className="mt-0.5 border-t border-[color-mix(in_srgb,var(--edge-strong)_60%,transparent)] pt-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-6 w-full cursor-pointer-always items-center gap-1 rounded-lg px-1.5 text-left text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
      >
        <ChevronRight
          size={10}
          strokeWidth={2}
          aria-hidden
          className={cn(
            "shrink-0 transition-transform duration-[160ms] ease-out",
            open && "rotate-90"
          )}
        />
        <span className="tabular-nums">Completed · {rows.length}</span>
      </button>
      {open ? (
        <div className="flex flex-col">
          {visible.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => toggle(row.id)}
              aria-pressed
              aria-label={`Mark "${row.name}" as not done`}
              className={cn(
                "flex h-6 w-full cursor-pointer-always items-center gap-2 rounded-lg px-1.5 text-left transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]",
                tintFor(row.id)
              )}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--tint-edge)] text-white">
                <Check size={9} strokeWidth={2.5} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-meta text-[var(--ink-faint)] line-through">
                {row.name}
              </span>
            </button>
          ))}
          {rows.length > 2 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="block w-full cursor-pointer-always rounded-lg px-1.5 py-0.5 text-left text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              {showAll ? "Show fewer" : `+${rows.length - 2} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Compact({ data }: { data: HabitsDockData }) {
  if (data.loading) {
    return <DockStateNote>Loading…</DockStateNote>;
  }
  if (data.rows.length === 0) {
    return <DockStateNote>Nothing scheduled today.</DockStateNote>;
  }
  const active = data.rows.filter((row) => !row.done);
  const done = data.rows.filter((row) => row.done);
  return (
    <div className="flex flex-col gap-0.5">
      <StatsLine data={data} />
      <DoneBar done={data.doneCount} total={data.rows.length} />
      {active.length > 0 ? (
        <div className="flex flex-col">
          {active.map((row) => (
            <HabitRow
              key={row.id}
              row={row}
              onAdvance={() => data.advance(row.id)}
              onSetStatus={(next) => data.setStatus(row.id, next)}
            />
          ))}
        </div>
      ) : null}
      <CompletedCluster rows={done} toggle={data.toggle} />
      {data.allDone ? (
        <p className="px-1.5 text-micro text-[var(--ink-faint)]">
          Done for today. See you tomorrow.
        </p>
      ) : null}
    </div>
  );
}

/** Slim sage completion bar under the stats line (3px — aug-05 tighten). */
function DoneBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  return (
    <div aria-hidden className="mx-1.5 h-[3px] overflow-hidden rounded-full bg-[var(--hover)]">
      <div
        className="h-full rounded-full bg-[var(--tint-sage-edge)] transition-[width] duration-[280ms] ease-out"
        style={{ width: `${Math.round((done / total) * 100)}%` }}
      />
    </div>
  );
}

/** Expanded: the same rows plus a last-7-days trail per habit. */
function Expanded({ data }: { data: HabitsDockData }) {
  const weekStart = addDaysISO(data.todayISO, -6);
  const { data: weekRows = [] } = useQuery({
    queryKey: [...tableKey("habit_completions", data.userId), weekStart, data.todayISO],
    queryFn: () => getHabitCompletionsInRange(weekStart, data.todayISO),
    enabled: Boolean(data.userId) && !data.loading,
  });

  if (data.loading) {
    return <DockStateNote>Loading…</DockStateNote>;
  }
  if (data.rows.length === 0) {
    return <DockStateNote>Nothing scheduled today.</DockStateNote>;
  }

  // Done rows only: a day left at `almost_done` earns no trail dot, same as it
  // earns no streak credit.
  const doneByHabit = new Map<string, Set<string>>();
  for (const c of weekRows.filter((r) => r.status === "done")) {
    const set = doneByHabit.get(c.habitId) ?? new Set<string>();
    set.add(c.completedDate);
    doneByHabit.set(c.habitId, set);
  }

  const active = data.rows.filter((row) => !row.done);
  const doneRows = data.rows.filter((row) => row.done);

  return (
    <div className="flex flex-col gap-0.5">
      <StatsLine data={data} />
      <DoneBar done={data.doneCount} total={data.rows.length} />
      {active.length > 0 ? (
        <div className="flex flex-col">
          {active.map((row) => {
            const done = doneByHabit.get(row.id) ?? new Set<string>();
            const trail = Array.from({ length: 7 }, (_, i) => {
              const iso = addDaysISO(data.todayISO, i - 6);
              return {
                // Today reflects the live (optimistic) row state, not the
                // possibly-stale week fetch.
                done: iso === data.todayISO ? row.done : done.has(iso),
                scheduled: Boolean(row.daysOfWeek[dayOfWeekISO(iso)]),
              };
            });
            return (
              <HabitRow
                key={row.id}
                row={row}
                trail={trail}
                onAdvance={() => data.advance(row.id)}
                onSetStatus={(next) => data.setStatus(row.id, next)}
              />
            );
          })}
        </div>
      ) : null}
      <CompletedCluster rows={doneRows} toggle={data.toggle} />
      <Link
        href="/habits"
        className="rounded-lg px-1.5 py-1 text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
      >
        Open habits
      </Link>
    </div>
  );
}

export const habitsWidget = defineDockWidget<HabitsDockData>({
  id: "habits",
  title: "Habits",
  defaultDocked: true,
  order: 15,
  useData: useHabitsDock,
  Compact,
  Expanded,
  icon: Repeat,
  tint: "tint-sage",
});
