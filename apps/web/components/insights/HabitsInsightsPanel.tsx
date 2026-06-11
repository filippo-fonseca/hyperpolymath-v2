"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { HabitFrequencyBadges } from "@/components/habits/HabitFrequencySelector";
import { toISODate, parseISODate } from "@/components/habits/date-utils";
import type { HabitWithAreas } from "@/app/actions/habits";
import { NEUMORPHIC_TILE } from "./tile-style";

interface Props {
  habits: HabitWithAreas[];
  /** Completions for the window passed in by the page. */
  completions: { habitId: string; completedDate: string }[];
  /** YYYY-MM-DD anchor for "today". */
  today: string;
  /** Earliest date available in the `completions` payload. */
  earliestAvailable: string;
}

type Range = "7d" | "28d" | "90d" | "all";
const RANGE_LABEL: Record<Range, string> = {
  "7d": "7 days",
  "28d": "28 days",
  "90d": "90 days",
  all: "All time",
};
const RANGE_DAYS: Record<Range, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
  all: Number.POSITIVE_INFINITY,
};

type Sort = "rate" | "streak" | "name" | "newest";

/**
 * Habit analytics tab — per-habit completion stats over a chosen window.
 *
 * The window has two boundaries:
 *   - the user-picked range (last 7 / 28 / 90 days / all-time),
 *   - clamped by `habit.createdAt` so a fresh habit isn't penalized for the
 *     days before it existed.
 *
 * Filters layer on top: area chip, search text, and sort order. Filters live
 * in URL-free local state — the page is single-user, so deep-linking the
 * filter combo isn't load-bearing yet.
 */
export function HabitsInsightsPanel({
  habits,
  completions,
  today,
  earliestAvailable,
}: Props) {
  const [range, setRange] = useState<Range>("28d");
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rate");

  // Set for O(1) "(habitId, date) was completed" lookups.
  const doneSet = useMemo(
    () => new Set(completions.map((c) => `${c.habitId}::${c.completedDate}`)),
    [completions],
  );

  // Build the global timeline of days we care about for the chosen range.
  // We clip to `earliestAvailable` so we never reach into days we don't have
  // completion data for — that would lie about misses.
  const timeline = useMemo(() => {
    const totalDays = Math.min(
      RANGE_DAYS[range],
      // +1 because both ends are inclusive
      Math.max(
        1,
        Math.round(
          (parseISODate(today).getTime() -
            parseISODate(earliestAvailable).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1,
      ),
    );
    const out: { iso: string; dow: number }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = parseISODate(today);
      d.setDate(d.getDate() - i);
      out.push({ iso: toISODate(d), dow: d.getDay() });
    }
    return out;
  }, [range, today, earliestAvailable]);

  // Apply filters first so sorting + render only walk what matters.
  const filteredHabits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return habits.filter((h) => {
      if (areaFilter && !h.areas.some((a) => a.id === areaFilter))
        return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [habits, areaFilter, query]);

  // Pre-compute per-habit stats so sorts can read straight off the row.
  const rows = useMemo(() => {
    return filteredHabits.map((h) => {
      const createdISO = toISODate(h.createdAt);
      let scheduled = 0;
      let done = 0;
      let streak = 0;
      let streakBroken = false;

      // Walk newest → oldest. Skip days BEFORE the habit existed (no
      // contribution to scheduled / done / streak).
      for (let i = timeline.length - 1; i >= 0; i--) {
        const { iso, dow } = timeline[i]!;
        if (iso < createdISO) {
          // Past creation. Treat as "doesn't count" — break streak only
          // if we hadn't broken it yet AND we've crossed createdAt going
          // backward.
          // (Streak measures consecutive scheduled days that were done,
          // walking backward from today; reaching before-creation simply
          // stops counting, it doesn't break anything.)
          break;
        }
        const isScheduled = h.daysOfWeek[dow] ?? false;
        const wasDone = doneSet.has(`${h.id}::${iso}`);
        if (isScheduled) {
          scheduled++;
          if (wasDone) done++;
          if (!streakBroken) {
            if (wasDone) streak++;
            else streakBroken = true;
          }
        }
      }

      const rate =
        scheduled === 0 ? null : Math.round((done / scheduled) * 100);

      return { habit: h, scheduled, done, streak, rate, createdISO };
    });
  }, [filteredHabits, timeline, doneSet]);

  const sortedRows = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (sort === "name") return a.habit.name.localeCompare(b.habit.name);
      if (sort === "newest")
        return b.createdISO.localeCompare(a.createdISO);
      if (sort === "streak") return b.streak - a.streak;
      // rate — nulls last so "no scheduled days in window" doesn't pollute
      // the top of the list.
      const ra = a.rate ?? -1;
      const rb = b.rate ?? -1;
      return rb - ra;
    });
    return out;
  }, [rows, sort]);

  // Aggregate summary across filtered habits in window.
  const summary = useMemo(() => {
    let scheduled = 0;
    let done = 0;
    for (const r of rows) {
      scheduled += r.scheduled;
      done += r.done;
    }
    const rate =
      scheduled === 0 ? null : Math.round((done / scheduled) * 100);
    return { scheduled, done, rate };
  }, [rows]);

  // Distinct areas across the filtered universe for the area chip row.
  const areaOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; emoji: string | null }
    >();
    for (const h of habits) for (const a of h.areas) map.set(a.id, a);
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [habits]);

  if (habits.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-12 text-center">
        <p className="font-serif italic text-[15px] text-[var(--ink-muted)]">
          No habits yet — add one to start seeing your patterns here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls — range pills + area chip filter + search + sort. */}
      <div className={`flex flex-col gap-3 ${NEUMORPHIC_TILE} bg-[var(--surface)] px-4 py-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface-raised)]">
            {(["7d", "28d", "90d", "all"] as Range[]).map((r) => (
              <ChipButton
                key={r}
                active={range === r}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </ChipButton>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name…"
              className={cn(
                "h-7 px-2 rounded-md border border-[var(--edge)] bg-[var(--surface-raised)]",
                "font-serif text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-muted)]",
                "focus:outline-none focus:border-[var(--ink-amber)] transition-colors",
              )}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className={cn(
                "h-7 px-2 rounded-md border border-[var(--edge)] bg-[var(--surface-raised)]",
                "font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink)]",
                "focus:outline-none focus:border-[var(--ink-amber)]",
              )}
              aria-label="Sort habits"
            >
              <option value="rate">Sort · rate</option>
              <option value="streak">Sort · streak</option>
              <option value="newest">Sort · newest</option>
              <option value="name">Sort · name</option>
            </select>
          </div>
        </div>

        {areaOptions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipButton
              active={areaFilter === null}
              onClick={() => setAreaFilter(null)}
            >
              All areas
            </ChipButton>
            {areaOptions.map((a) => (
              <ChipButton
                key={a.id}
                active={areaFilter === a.id}
                onClick={() =>
                  setAreaFilter((prev) => (prev === a.id ? null : a.id))
                }
              >
                {a.emoji ? <span aria-hidden="true">{a.emoji}</span> : null}
                {a.name}
              </ChipButton>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-4 pt-1">
          <Stat label="Done" value={`${summary.done}`} />
          <Stat label="Scheduled" value={`${summary.scheduled}`} />
          <Stat
            label="Rate"
            value={summary.rate === null ? "—" : `${summary.rate}%`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
            across {sortedRows.length} habit{sortedRows.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {sortedRows.map(({ habit, scheduled, done, streak, rate, createdISO }) => {
          // Build the per-habit strip — clamped at createdAt so days BEFORE
          // creation render as "pre-creation" (no border + no fill) and the
          // user sees the habit's actual lived window.
          const stripCells: {
            iso: string;
            scheduled: boolean;
            done: boolean;
            preCreation: boolean;
          }[] = [];
          for (const { iso, dow } of timeline) {
            const preCreation = iso < createdISO;
            stripCells.push({
              iso,
              scheduled: !preCreation && (habit.daysOfWeek[dow] ?? false),
              done: !preCreation && doneSet.has(`${habit.id}::${iso}`),
              preCreation,
            });
          }

          return (
            <li
              key={habit.id}
              className={`${NEUMORPHIC_TILE} bg-[var(--surface)] px-4 py-3 flex flex-col gap-2.5`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <p className="font-serif text-[15px] text-[var(--ink)] truncate">
                    {habit.name}
                  </p>
                  {habit.areas.length > 0 ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] mt-0.5 truncate">
                      {habit.areas
                        .map((a) => `${a.emoji ?? ""} ${a.name}`.trim())
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <Stat label="Done" value={`${done}/${scheduled}`} />
                  <Stat label="Rate" value={rate === null ? "—" : `${rate}%`} />
                  <Stat
                    label="Streak"
                    value={`${streak} day${streak === 1 ? "" : "s"}`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <HabitFrequencyBadges value={habit.daysOfWeek} />
                <div className="flex items-center gap-[3px] flex-wrap justify-end max-w-[65%]">
                  {stripCells.map((d) => (
                    <span
                      key={d.iso}
                      title={
                        d.preCreation
                          ? `${d.iso} · before creation`
                          : `${d.iso}${d.scheduled ? (d.done ? " · done" : " · missed") : " · not scheduled"}`
                      }
                      className={cn(
                        "inline-block w-2 h-2 rounded-[2px]",
                        d.preCreation
                          ? "bg-transparent border border-[var(--edge)]/30"
                          : d.done
                            ? "bg-[var(--ink-amber)]"
                            : d.scheduled
                              ? "bg-transparent border border-[var(--ink-muted)]/40"
                              : "bg-transparent border border-[var(--edge)]/50",
                      )}
                    />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="font-mono text-[14px] tabular-nums text-[var(--ink)]">
        {value}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        {label}
      </span>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm",
        "font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--edge)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
      )}
    >
      {children}
    </button>
  );
}
