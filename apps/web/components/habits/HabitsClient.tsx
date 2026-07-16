"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  Flame,
} from "lucide-react";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { OptimisticAction } from "@/lib/realtime/optimistic-reducer";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import {
  getHabitsForCurrentUser,
  getHabitCompletionsInRange,
  getArchivedHabitsForCurrentUser,
  toggleHabitCompletion,
  deleteHabit,
  updateHabit,
  type HabitWithAreas,
} from "@/app/actions/habits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Chip, EmptyState, ProgressRow } from "@/components/lifeos/entity-card";
import { HabitIcon } from "@/components/ui/icons";
import { sfx } from "@/lib/ui/sfx";
import { HabitDialog, type AreaOption } from "./HabitDialog";
import { HabitFrequencyBadges } from "./HabitFrequencySelector";
import { MiniCalendar } from "./MiniCalendar";
import {
  addDaysISO,
  parseISODate,
  toISODate,
  todayISO as nowISO,
} from "./date-utils";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  initialHabits: HabitWithAreas[];
  initialArchived: HabitWithAreas[];
  initialCompletions: { habitId: string; completedDate: string }[];
  areas: AreaOption[];
}

type Tab = "today" | "manage" | "archive";

/**
 * sd row plate — the WidgetCard chrome distilled to a list row: `--sd-box`
 * fill raised off `--sd-app`, 14px radius, hairline border, and (dark only) a
 * white inset top hairline that catches the light. No glass, no blur, no glow.
 */
const ROW_PLATE =
  "rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] " +
  "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]";

const ROW_PLATE_HOVER =
  "transition-colors duration-150 " +
  "hover:border-[color-mix(in_srgb,var(--sd-ink)_18%,var(--sd-line))] dark:hover:border-white/10";

const FULL_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDateLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  if (iso === addDaysISO(today, 1)) return "Tomorrow";
  const d = parseISODate(iso);
  return `${FULL_DAY_NAMES[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Consecutive scheduled-and-completed days ending at `refISO`, counted back
 * through the loaded completion window. A pending *today* (scheduled but not
 * yet checked) doesn't zero the streak — it's simply skipped so an unchecked
 * morning doesn't erase yesterday's run. Non-scheduled days are transparent.
 */
function computeStreak(
  habit: HabitWithAreas,
  isCompleted: (habitId: string, date: string) => boolean,
  refISO: string,
  todayIso: string,
): number {
  let streak = 0;
  let cursor = refISO;
  const createdISO = toISODate(habit.createdAt);
  // 14 = the loaded completion window; streaks preview, they don't audit.
  for (let i = 0; i < 14; i++) {
    if (cursor < createdISO) break;
    const dow = parseISODate(cursor).getDay();
    if (habit.daysOfWeek[dow]) {
      if (isCompleted(habit.id, cursor)) {
        streak++;
      } else if (cursor === todayIso && i === 0) {
        // today still open — don't break the chain, just don't count it
      } else {
        break;
      }
    }
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

/**
 * Habits surface. Three tabs over one shared data plane:
 *
 *   • Today    — daily-use; navigates any date (prev / next / calendar) and
 *                  shows habits scheduled for the chosen date with check-off.
 *   • Manage   — full list of ACTIVE habits with edit / archive / delete.
 *                  No check-off here so it doesn't compete with Today.
 *   • Archive  — habits the user archived, with created + archived dates
 *                  and a restore action.
 *
 * Same `["habits", userId]` + `["habit_completions", userId, start, end]`
 * cache contract as before. Optimistic flips for completion toggles; explicit
 * refetch after server writes.
 *
 * Stats clamping rule: per-habit windows start at `max(today - N, createdAt)`
 * so a habit added today isn't penalized with a 1/N completion rate for the
 * rest of its first month.
 */
export function HabitsClient({
  userId,
  initialHabits,
  initialArchived,
  initialCompletions,
  areas,
}: Props) {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("today");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HabitWithAreas | null>(null);

  // Today (real now). Re-syncs on focus in case the tab crossed midnight.
  const [today, setToday] = useState<string>(() => nowISO());
  useEffect(() => {
    function refresh() {
      setToday(nowISO());
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // ── Habits cache ───────────────────────────────────────────────────────
  useTableSubscription("habits", userId);
  useTableSubscription("habits_areas", userId, {
    alsoInvalidate: [tableKey("habits", userId)],
  });

  const { data: habits = initialHabits } = useQuery({
    queryKey: tableKey("habits", userId),
    queryFn: getHabitsForCurrentUser,
    initialData: initialHabits,
  });

  // ── Archived habits — only refreshed when needed ───────────────────────
  const { data: archived = initialArchived } = useQuery({
    queryKey: ["habits_archived", userId],
    queryFn: getArchivedHabitsForCurrentUser,
    initialData: initialArchived,
  });

  // ── Completions cache (rolling 14-day window from today) ──────────────
  const windowStart = useMemo(() => addDaysISO(today, -13), [today]);
  useTableSubscription("habit_completions", userId);

  const { data: completions = initialCompletions } = useQuery({
    queryKey: [...tableKey("habit_completions", userId), windowStart, today],
    queryFn: () => getHabitCompletionsInRange(windowStart, today),
    initialData: initialCompletions,
  });

  // ── Optimistic completion overlay ─────────────────────────────────────
  type Completion = { habitId: string; completedDate: string; id: string };
  const completionRows: Completion[] = useMemo(
    () =>
      completions.map((c) => ({
        ...c,
        id: `${c.habitId}::${c.completedDate}`,
      })),
    [completions],
  );
  // RT-06 self-reconciling overlay — a toggled completion persists until the
  // canonical range query catches up, so it can't flicker off-and-on under a
  // slow refetch or Realtime echo.
  const [optimisticCompletions, addCompletionOptimistic] =
    useOptimisticList<Completion>(completionRows);

  const completionSet = useMemo(
    () => new Set(optimisticCompletions.map((c) => c.id)),
    [optimisticCompletions],
  );
  const isCompleted = useCallback(
    (habitId: string, date: string) =>
      completionSet.has(`${habitId}::${date}`),
    [completionSet],
  );

  function handleToggle(habitId: string, date: string) {
    const key = `${habitId}::${date}`;
    const currentlyDone = completionSet.has(key);
    const next = !currentlyDone;

    // Space-console cue on completion only — never on un-check. No-op when
    // muted or while the shared AudioContext is still gesture-locked.
    if (next) sfx.play("habitCheck");

    startTransition(async () => {
      const action: OptimisticAction<Completion> = next
        ? {
            type: "insert",
            row: { id: key, habitId, completedDate: date },
          }
        : { type: "delete", id: key };
      addCompletionOptimistic(action);

      const r = await toggleHabitCompletion({
        habitId,
        completedDate: date,
        completed: next,
      });
      if (!r.success) {
        toast.error(r.error);
        addCompletionOptimistic({ type: "revert", id: key });
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [
          ...tableKey("habit_completions", userId),
          windowStart,
          today,
        ],
      });
    });
  }

  async function handleArchive(habit: HabitWithAreas) {
    const r = await updateHabit({ id: habit.id, archived: true });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Habit archived.");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: tableKey("habits", userId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["habits_archived", userId],
      }),
    ]);
  }

  async function handleRestore(habit: HabitWithAreas) {
    const r = await updateHabit({ id: habit.id, archived: false });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Habit restored.");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: tableKey("habits", userId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["habits_archived", userId],
      }),
    ]);
  }

  async function handleDelete(habit: HabitWithAreas) {
    const r = await deleteHabit(habit.id);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Habit deleted.");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: tableKey("habits", userId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["habits_archived", userId],
      }),
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Segmented tab strip + primary action */}
      <div className="flex items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Habits view"
          className="flex w-fit items-center gap-0.5 rounded-lg border border-[var(--sd-line)] bg-[var(--sd-box)] p-0.5"
        >
          <TabButton active={tab === "today"} onClick={() => setTab("today")}>
            Today
          </TabButton>
          <TabButton
            active={tab === "manage"}
            onClick={() => setTab("manage")}
          >
            Manage
            <span className="ml-1 tabular-nums text-[var(--sd-ink-faint)]">
              {habits.length}
            </span>
          </TabButton>
          <TabButton
            active={tab === "archive"}
            onClick={() => setTab("archive")}
          >
            Archive
            <span className="ml-1 tabular-nums text-[var(--sd-ink-faint)]">
              {archived.length}
            </span>
          </TabButton>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New habit
        </Button>
      </div>

      {tab === "today" ? (
        <TodayTab
          habits={habits}
          isCompleted={isCompleted}
          onToggle={handleToggle}
          today={today}
        />
      ) : tab === "manage" ? (
        <ManageTab
          habits={habits}
          today={today}
          isCompleted={isCompleted}
          onEdit={(h) => setEditing(h)}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <ArchiveTab
          archived={archived}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      )}

      <HabitDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        areas={areas}
      />
      {editing ? (
        <HabitDialog
          mode="edit"
          habit={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          areas={areas}
        />
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Today tab — date navigator + scheduled habits with check-off
// ──────────────────────────────────────────────────────────────────────────

function TodayTab({
  habits,
  isCompleted,
  onToggle,
  today,
}: {
  habits: HabitWithAreas[];
  isCompleted: (habitId: string, date: string) => boolean;
  onToggle: (habitId: string, date: string) => void;
  today: string;
}) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [calOpen, setCalOpen] = useState(false);

  // Auto-snap to "today" if the day rolls over while we were on yesterday.
  // (No-op for any other selection — only when today's value changed AND
  // we were anchored to the previous today.)
  useEffect(() => {
    setSelectedDate((prev) => (prev <= today ? today : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const selectedDow = parseISODate(selectedDate).getDay();
  const selectedISO = selectedDate;
  const isFuture = selectedDate > today;
  const isPast = selectedDate < today;

  // Habits scheduled for the selected day. We exclude habits created AFTER
  // the selected date — checking off a habit on a day before it existed is
  // unhelpful and skews stats.
  const dayHabits = useMemo(
    () =>
      habits
        .filter((h) => h.daysOfWeek[selectedDow])
        .filter((h) => toISODate(h.createdAt) <= selectedISO),
    [habits, selectedDow, selectedISO],
  );

  const completedCount = dayHabits.filter((h) =>
    isCompleted(h.id, selectedISO),
  ).length;

  return (
    <section className="flex flex-col gap-4">
      {/* Day navigator — prev / label+calendar / next, with a "jump to today"
          reset on the right when off-today. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Previous day"
            onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="px-2 text-[15px] font-semibold leading-none tracking-[-0.01em]"
              >
                <CalendarIcon
                  size={13}
                  className="mr-1.5 opacity-60"
                  aria-hidden="true"
                />
                {formatDateLabel(selectedDate, today)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <MiniCalendar
                value={selectedDate}
                onChange={(iso) => {
                  setSelectedDate(iso);
                  setCalOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Next day"
            onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
          >
            <ChevronRight size={14} />
          </Button>
          {selectedDate !== today ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em]"
              onClick={() => setSelectedDate(today)}
            >
              Jump to today
            </Button>
          ) : null}
        </div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--sd-ink-faint)]">
          {completedCount} / {dayHabits.length}
        </span>
      </div>

      {/* Progress plate — hatched accent bar, mirrors TodayHabitsWidget. */}
      {dayHabits.length > 0 ? (
        <div className={cn("px-4 py-3.5", ROW_PLATE)}>
          <ProgressRow
            label={
              completedCount === dayHabits.length
                ? "All done"
                : "Completed"
            }
            value={`${completedCount}/${dayHabits.length}`}
            ratio={dayHabits.length ? completedCount / dayHabits.length : 0}
          />
        </div>
      ) : null}

      {/* Past / future hint band. Future = can't affect today; past = backfill. */}
      {isFuture ? (
        <div className={cn("px-3.5 py-2.5 text-[12px] text-[var(--sd-ink-dull)]", ROW_PLATE)}>
          Viewing a future day — check-off is enabled but won't change today's
          counts.
        </div>
      ) : null}

      {dayHabits.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--sd-line)] px-6 py-10">
          <EmptyState icon={<HabitIcon size={40} />}>
            {habits.length === 0
              ? "No habits yet — add one to begin."
              : isPast
                ? "Nothing was scheduled this day, or all your habits were created later."
                : "Nothing scheduled for this day."}
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {dayHabits.map((h) => (
              <motion.li
                key={h.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <DayHabitRow
                  habit={h}
                  completed={isCompleted(h.id, selectedISO)}
                  streak={computeStreak(h, isCompleted, selectedISO, today)}
                  onToggle={() => onToggle(h.id, selectedISO)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function DayHabitRow({
  habit,
  completed,
  streak,
  onToggle,
}: {
  habit: HabitWithAreas;
  completed: boolean;
  streak: number;
  onToggle: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", ROW_PLATE, ROW_PLATE_HOVER)}>
      <CheckCircle completed={completed} onClick={onToggle} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[15px]",
            completed
              ? "text-[var(--sd-ink-faint)] line-through"
              : "text-[var(--sd-ink)]",
          )}
        >
          {habit.name}
        </p>
        {habit.areas.length > 0 ? (
          <p className="mt-0.5 truncate text-[11px] text-[var(--sd-ink-faint)]">
            {habit.areas
              .map((a) => `${a.emoji ?? ""} ${a.name}`.trim())
              .join(" · ")}
          </p>
        ) : null}
      </div>
      <StreakChip streak={streak} />
    </div>
  );
}

/** Functional-amber streak accent — the only non-cyan hue on this surface. */
function StreakChip({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <Chip icon={<Flame size={11} />} tone="var(--ink-amber)">
      <span className="tabular-nums">{streak}</span>
    </Chip>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Manage tab — full list with edit / archive / delete, clamped stats
// ──────────────────────────────────────────────────────────────────────────

function ManageTab({
  habits,
  today,
  isCompleted,
  onEdit,
  onArchive,
  onDelete,
  onCreate,
}: {
  habits: HabitWithAreas[];
  today: string;
  isCompleted: (habitId: string, date: string) => boolean;
  onEdit: (h: HabitWithAreas) => void;
  onArchive: (h: HabitWithAreas) => Promise<void>;
  onDelete: (h: HabitWithAreas) => Promise<void>;
  onCreate: () => void;
}) {
  if (habits.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--sd-line)] px-6 py-12 text-center">
        <p className="text-[14px] text-[var(--sd-ink-dull)]">
          Habits you build here repeat on the days you pick.
        </p>
        <Button className="mt-4" size="sm" onClick={onCreate}>
          <Plus size={14} /> Add your first habit
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {habits.map((h) => (
        <li key={h.id}>
          <ManageHabitRow
            habit={h}
            today={today}
            isCompleted={isCompleted}
            onEdit={() => onEdit(h)}
            onArchive={() => onArchive(h)}
            onDelete={() => onDelete(h)}
          />
        </li>
      ))}
    </ul>
  );
}

function ManageHabitRow({
  habit,
  today,
  isCompleted,
  onEdit,
  onArchive,
  onDelete,
}: {
  habit: HabitWithAreas;
  today: string;
  isCompleted: (habitId: string, date: string) => boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const createdISO = toISODate(habit.createdAt);

  // 7-day strip ending today. Clamp by createdAt — earlier days render as
  // "didn't exist" (faint, borderless) to keep the "habit is new" honest.
  const strip = useMemo(() => {
    const out: {
      iso: string;
      scheduled: boolean;
      done: boolean;
      preCreation: boolean;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const iso = addDaysISO(today, -i);
      const preCreation = iso < createdISO;
      const dow = parseISODate(iso).getDay();
      out.push({
        iso,
        scheduled: !preCreation && habit.daysOfWeek[dow],
        done: !preCreation && isCompleted(habit.id, iso),
        preCreation,
      });
    }
    return out;
  }, [habit, today, createdISO, isCompleted]);

  const streak = computeStreak(habit, isCompleted, today, today);

  return (
    <div
      className={cn("flex items-center gap-3 px-4 py-3", ROW_PLATE, ROW_PLATE_HOVER)}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col text-left cursor-pointer-always"
      >
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] text-[var(--sd-ink)]">
            {habit.name}
          </p>
          {streak >= 2 ? <StreakChip streak={streak} /> : null}
        </div>
        {habit.description ? (
          <p className="mt-0.5 truncate text-[12px] text-[var(--sd-ink-dull)]">
            {habit.description}
          </p>
        ) : null}
        {habit.areas.length > 0 ? (
          <p className="mt-1 truncate text-[11px] text-[var(--sd-ink-faint)]">
            {habit.areas
              .map((a) => `${a.emoji ?? ""} ${a.name}`.trim())
              .join(" · ")}
          </p>
        ) : null}
      </button>

      <HabitFrequencyBadges value={habit.daysOfWeek} />

      <div className="ml-3 flex items-center gap-1">
        {strip.map((d) => (
          <span
            key={d.iso}
            title={
              d.preCreation
                ? `${d.iso} · before creation`
                : `${d.iso}${d.scheduled ? "" : " · not scheduled"}${d.done ? " · done" : ""}`
            }
            aria-hidden="true"
            className="inline-block size-2 rounded-full"
            style={
              d.preCreation
                ? { border: "1px solid color-mix(in srgb, var(--sd-line) 50%, transparent)" }
                : d.done
                  ? { background: "var(--sd-accent)" }
                  : d.scheduled
                    ? { border: "1px solid var(--sd-ink-faint)" }
                    : { border: "1px solid var(--sd-line)" }
            }
          />
        ))}
      </div>

      <HabitRowMenu
        onEdit={onEdit}
        onArchive={onArchive}
        onDelete={onDelete}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Archive tab
// ──────────────────────────────────────────────────────────────────────────

function ArchiveTab({
  archived,
  onRestore,
  onDelete,
}: {
  archived: HabitWithAreas[];
  onRestore: (h: HabitWithAreas) => Promise<void>;
  onDelete: (h: HabitWithAreas) => Promise<void>;
}) {
  if (archived.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--sd-line)] px-6 py-12 text-center">
        <p className="text-[14px] text-[var(--sd-ink-dull)]">
          Nothing archived. Archive a habit from Manage to stash it here.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {archived.map((h) => (
        <li
          key={h.id}
          className={cn("flex items-center gap-3 px-4 py-3", ROW_PLATE)}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-[15px] text-[var(--sd-ink-dull)]">
              {h.name}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
              Created {prettyDate(h.createdAt)}
              {h.archivedAt
                ? `  ·  Archived ${prettyDate(h.archivedAt)}`
                : null}
            </p>
            {h.areas.length > 0 ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--sd-ink-faint)]">
                {h.areas
                  .map((a) => `${a.emoji ?? ""} ${a.name}`.trim())
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRestore(h)}
            className="font-mono text-[11px] uppercase tracking-[0.06em]"
          >
            <ArchiveRestore size={13} /> Restore
          </Button>
          <HabitRowMenu
            onEdit={() => onRestore(h)}
            onArchive={() => onRestore(h)}
            onDelete={() => onDelete(h)}
            variant="archive"
          />
        </li>
      ))}
    </ul>
  );
}

function prettyDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Shared UI bits
// ──────────────────────────────────────────────────────────────────────────

function CheckCircle({
  completed,
  onClick,
}: {
  completed: boolean;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={completed}
      aria-label={completed ? "Mark not done" : "Mark done"}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2",
        "cursor-pointer-always transition-colors duration-150 ease-out",
        completed
          ? "border-[var(--sd-accent)] bg-[var(--sd-accent)] text-[var(--sd-app)]"
          : "border-[var(--sd-line)] bg-transparent hover:border-[var(--sd-accent)]",
      )}
    >
      <motion.span
        initial={false}
        animate={
          reduced ? undefined : completed ? { scale: [1, 1.22, 1] } : { scale: 1 }
        }
        transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
        className="inline-flex"
      >
        {completed ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 7.5L6 10.5L11 4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </motion.span>
    </button>
  );
}

function HabitRowMenu({
  onEdit,
  onArchive,
  onDelete,
  variant = "active",
}: {
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  variant?: "active" | "archive";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Habit options"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--sd-ink-faint)] transition-colors hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] cursor-pointer-always"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {variant === "active" ? (
          <>
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>
              <Archive size={14} /> Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onArchive}>
              <ArchiveRestore size={14} /> Restore
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabButton({
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
      role="tab"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--sd-input)] text-[var(--sd-ink)] ring-1 ring-inset ring-[var(--sd-line)]"
          : "text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]",
      )}
    >
      {children}
    </button>
  );
}
