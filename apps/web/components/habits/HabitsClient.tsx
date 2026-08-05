"use client";

import {
  type HabitDockToday,
  type HabitWithAreas,
  deleteHabit,
  getArchivedHabitsForCurrentUser,
  getHabitsForCurrentUser,
  updateHabit,
} from "@/app/actions/habits";
import { Chip, ProgressRow } from "@/components/lifeos/entity-card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageScaffold } from "@/components/ui/PageScaffold";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HabitIcon } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type AreaOption, HabitDialog } from "./HabitDialog";
import { MiniCalendar } from "./MiniCalendar";
import { addDaysISO, dayOfWeekISO, parseISODate, toISODate } from "./date-utils";
import { scheduleLabel } from "./schedule";
import { useHabitDay, useHabitMeta } from "./use-habit-data";
import { useLocalToday } from "./use-local-today";

interface Props {
  userId: string;
  /** The server's local date at render time; seeds are keyed by it. */
  serverToday: string;
  initialHabits: HabitWithAreas[];
  initialTodayCompletions: { habitId: string; completedDate: string }[];
  initialMeta: HabitDockToday;
  areas: AreaOption[];
}

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

function prettyDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

type StreakDisplay = { value: number; saturated: boolean };

/**
 * The row chrome for both lists: one border per nesting level (the row sits on
 * the canvas, so it carries the only border), surface-raised fill, 8px radius
 * per the ladder, hover to --edge-strong only.
 */
/** jul-29 craft restyle: habit rows are lifted white cards. Compose with a
 *  tintFor(habit.id) class so the row's check circle and hover rim pick up
 *  the habit's own pastel via var(--tint-…). */
const ROW = "craft-card craft-card-hover flex items-center gap-3 px-4 py-3";

/**
 * /habits — the daily loop on the stage.
 *
 * One document, two sections: **Today** (the check-off surface — nothing on it
 * edits, archives or analyzes) and **All habits** (manage: edit, archive,
 * delete, with the archive list revealed on demand and fetched lazily).
 *
 * Data plane: `useHabitDay` for per-day completion state (shared cache entry
 * with the dock widget and the LifeOS tile for today), `useHabitMeta` for
 * streak bases and the 28-day rate (shared with the dock widget). Completions
 * refresh rides the realtime echo alone; the optimistic overlay keeps a toggle
 * on screen until canonical catches up. See `use-habit-data.ts`.
 */
export function HabitsClient({
  userId,
  serverToday,
  initialHabits,
  initialTodayCompletions,
  initialMeta,
  areas,
}: Props) {
  const queryClient = useQueryClient();
  const today = useLocalToday();
  // Server seeds are only valid for the day the server rendered.
  const seedOk = today === serverToday;

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HabitWithAreas | null>(null);
  const [deleting, setDeleting] = useState<HabitWithAreas | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);

  // If the day rolls over while we sit on the old "today", snap forward. An
  // explicitly chosen backfill date stays put.
  useEffect(() => {
    setSelectedDate((prev) => (prev === addDaysISO(today, -1) ? today : prev));
  }, [today]);

  // ── Live data plane ────────────────────────────────────────────────────
  useTableSubscription("habits", userId);
  useTableSubscription("habits_areas", userId, {
    alsoInvalidate: [tableKey("habits", userId)],
  });
  useTableSubscription("habit_completions", userId);

  const { data: habits = initialHabits } = useQuery({
    queryKey: tableKey("habits", userId),
    queryFn: getHabitsForCurrentUser,
    initialData: initialHabits,
  });

  const { data: meta } = useHabitMeta(userId, today, seedOk ? initialMeta : undefined);

  // Today's completion state is always mounted (the header stats read it) and
  // must be declared before the selected-day hook so the seeded instance
  // creates the shared cache entry.
  const todayBase = useHabitDay(userId, today, today, seedOk ? initialTodayCompletions : undefined);
  const selectedDay = useHabitDay(userId, selectedDate, today);
  const isTodaySelected = selectedDate === today;
  const todayDay = isTodaySelected ? selectedDay : todayBase;

  // ── Derived stats (live: base streaks + today's optimistic state) ─────
  const metaById = useMemo(() => new Map((meta?.habits ?? []).map((h) => [h.id, h])), [meta]);
  const scheduledToday = useMemo(
    () => (meta?.habits ?? []).filter((h) => h.scheduledToday),
    [meta]
  );
  const doneTodayCount = useMemo(
    () => scheduledToday.filter((h) => todayDay.doneSet.has(h.id)).length,
    [scheduledToday, todayDay.doneSet]
  );

  const streakOf = useCallback(
    (habitId: string): StreakDisplay => {
      const m = metaById.get(habitId);
      if (!m) return { value: 0, saturated: false };
      const credit = m.scheduledToday && todayDay.doneSet.has(habitId) ? 1 : 0;
      return { value: m.streakBase + credit, saturated: m.streakSaturated };
    },
    [metaById, todayDay.doneSet]
  );

  const bestStreak = useMemo(() => {
    let best: StreakDisplay = { value: 0, saturated: false };
    for (const h of meta?.habits ?? []) {
      const s = streakOf(h.id);
      if (s.value > best.value) best = s;
    }
    return best;
  }, [meta, streakOf]);

  const rate28 = useMemo(() => {
    if (!meta) return null;
    const scheduled = meta.rate28.scheduled + scheduledToday.length;
    if (scheduled === 0) return null;
    return Math.round(((meta.rate28.done + doneTodayCount) / scheduled) * 100);
  }, [meta, scheduledToday.length, doneTodayCount]);

  // ── Selected-day list ──────────────────────────────────────────────────
  const selectedDow = dayOfWeekISO(selectedDate);
  const dayHabits = useMemo(
    () =>
      habits
        .filter((h) => h.daysOfWeek[selectedDow])
        .filter((h) => toISODate(h.createdAt) <= selectedDate),
    [habits, selectedDow, selectedDate]
  );
  const dayDoneCount = dayHabits.filter((h) => selectedDay.doneSet.has(h.id)).length;
  const isFuture = selectedDate > today;
  const isPast = selectedDate < today;

  // ── Archived (fetched only when revealed) ──────────────────────────────
  const { data: archived = [], isPending: archivedPending } = useQuery({
    queryKey: ["habits_archived", userId],
    queryFn: getArchivedHabitsForCurrentUser,
    enabled: showArchived,
  });

  // ── Mutations beyond the toggle ────────────────────────────────────────
  const invalidateHabitLists = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tableKey("habits", userId) }),
      queryClient.invalidateQueries({ queryKey: ["habits_archived", userId] }),
    ]);
  }, [queryClient, userId]);

  // Makes a created or edited habit appear before any realtime echo lands.
  const handleSaved = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: tableKey("habits", userId),
    });
  }, [queryClient, userId]);

  async function handleArchive(habit: HabitWithAreas) {
    const r = await updateHabit({ id: habit.id, archived: true });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Habit archived.");
    await invalidateHabitLists();
  }

  async function handleRestore(habit: HabitWithAreas) {
    const r = await updateHabit({ id: habit.id, archived: false });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Habit restored.");
    await invalidateHabitLists();
  }

  async function handleDeleteConfirmed() {
    const habit = deleting;
    setDeleting(null);
    if (!habit) return;
    const r = await deleteHabit(habit.id);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Habit deleted.");
    await invalidateHabitLists();
  }

  // ── Header meta line ───────────────────────────────────────────────────
  const remainingLabel =
    scheduledToday.length === 0
      ? "Nothing scheduled today"
      : doneTodayCount === scheduledToday.length
        ? `All ${scheduledToday.length} done today`
        : `${scheduledToday.length - doneTodayCount} of ${scheduledToday.length} left today`;

  const streakLabel =
    bestStreak.value > 0
      ? `Best streak ${bestStreak.value}${bestStreak.saturated ? "+" : ""} ${
          bestStreak.value === 1 && !bestStreak.saturated ? "day" : "days"
        }`
      : habits.length > 0
        ? "No streak yet"
        : null;

  return (
    <PageScaffold
      icon={<HabitIcon size={28} />}
      title="Habits"
      subtitle="We are what we repeatedly do. Excellence, then, is not an act, but a habit. (Aristotle, via Will Durant)"
      meta={
        <PageScaffold.MetaRow>
          {[
            <span key="remaining" data-habits-remaining className="tabular-nums">
              {remainingLabel}
            </span>,
            streakLabel ? (
              <span key="streak" data-habits-streak className="tabular-nums">
                {streakLabel}
              </span>
            ) : null,
            rate28 !== null ? (
              <span key="rate" data-habits-rate className="tabular-nums">
                {rate28}% over 28 days
              </span>
            ) : null,
          ]}
        </PageScaffold.MetaRow>
      }
      actions={
        <Button size="sm" className="rounded-lg" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New habit
        </Button>
      }
    >
      {habits.length === 0 ? (
        <PageScaffold.Section>
          <EmptyState
            size="section"
            icon={<HabitIcon size={40} />}
            title="No habits yet"
            description="Habits repeat on the days you pick, then show up here and in the dock for one-tap check-off."
            action={{ label: "New habit", onClick: () => setCreateOpen(true) }}
          />
        </PageScaffold.Section>
      ) : (
        <>
          <PageScaffold.Section>
            <DaySection
              habits={dayHabits}
              doneCount={dayDoneCount}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              today={today}
              isFuture={isFuture}
              isPast={isPast}
              isToday={isTodaySelected}
              doneSet={selectedDay.doneSet}
              onToggle={selectedDay.toggle}
              streakOf={streakOf}
            />
          </PageScaffold.Section>

          <PageScaffold.Section
            title="All habits"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </Button>
            }
          >
            <ul className="flex flex-col gap-2">
              {habits.map((h) => (
                <li key={h.id}>
                  <ManageHabitRow
                    habit={h}
                    streak={streakOf(h.id)}
                    onEdit={() => setEditing(h)}
                    onArchive={() => handleArchive(h)}
                    onDelete={() => setDeleting(h)}
                  />
                </li>
              ))}
            </ul>

            {showArchived ? (
              <div className="mt-6">
                <h3 className="mb-3 text-micro font-medium text-[var(--ink-faint)]">Archived</h3>
                {archivedPending ? (
                  <p className="text-meta text-[var(--ink-faint)]">Loading…</p>
                ) : archived.length === 0 ? (
                  <EmptyState size="inline" title="Nothing archived yet." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {archived.map((h) => (
                      <li key={h.id}>
                        <ArchivedHabitRow
                          habit={h}
                          onRestore={() => handleRestore(h)}
                          onDelete={() => setDeleting(h)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </PageScaffold.Section>
        </>
      )}

      <HabitDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        areas={areas}
        onSaved={handleSaved}
      />
      {editing ? (
        <HabitDialog
          mode="edit"
          habit={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          areas={areas}
          onSaved={handleSaved}
        />
      ) : null}

      {/* Destructive confirmation — one of the two sanctioned modal uses. */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete habit?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleting?.name}” and its completion history. Archiving
              keeps the history instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg" onClick={handleDeleteConfirmed}>
              Delete habit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageScaffold>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Today — day navigator + check-off list. Check-off only: no edit, no
// archive, no analytics on the daily surface.
// ──────────────────────────────────────────────────────────────────────────

function DaySection({
  habits,
  doneCount,
  selectedDate,
  onSelectDate,
  today,
  isFuture,
  isPast,
  isToday,
  doneSet,
  onToggle,
  streakOf,
}: {
  habits: HabitWithAreas[];
  doneCount: number;
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  today: string;
  isFuture: boolean;
  isPast: boolean;
  isToday: boolean;
  doneSet: ReadonlySet<string>;
  onToggle: (habitId: string) => void;
  streakOf: (habitId: string) => StreakDisplay;
}) {
  const [calOpen, setCalOpen] = useState(false);
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col">
      {/* Day navigator */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-lg"
            aria-label="Previous day"
            onClick={() => onSelectDate(addDaysISO(selectedDate, -1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg px-2 text-meta font-medium"
              >
                <CalendarIcon size={14} className="opacity-60" aria-hidden="true" />
                {formatDateLabel(selectedDate, today)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <MiniCalendar
                value={selectedDate}
                onChange={(iso) => {
                  onSelectDate(iso);
                  setCalOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-lg"
            aria-label="Next day"
            onClick={() => onSelectDate(addDaysISO(selectedDate, 1))}
          >
            <ChevronRight size={14} />
          </Button>
          {!isToday ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 rounded-lg text-meta"
              onClick={() => onSelectDate(today)}
            >
              Jump to today
            </Button>
          ) : null}
        </div>
      </div>

      {isFuture ? (
        <p className="mt-3 text-meta text-[var(--ink-muted)]">
          This day has not started yet; check-off opens on the day.
        </p>
      ) : null}

      {habits.length > 0 ? (
        <div className="mt-4">
          <ProgressRow
            label={doneCount === habits.length ? "All done" : "Completed"}
            value={`${doneCount}/${habits.length}`}
            ratio={habits.length ? doneCount / habits.length : 0}
          />
        </div>
      ) : null}

      {habits.length === 0 ? (
        <EmptyState
          size="inline"
          title={isPast ? "Nothing was scheduled this day." : "Nothing scheduled for this day."}
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {habits.map((h) => (
              <motion.li
                key={h.id}
                initial={reduced ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, y: 4, transition: { duration: 0.16 } }
                }
                transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
              >
                <DayHabitRow
                  habit={h}
                  completed={doneSet.has(h.id)}
                  streak={isToday ? streakOf(h.id) : null}
                  disabled={isFuture}
                  onToggle={() => onToggle(h.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function DayHabitRow({
  habit,
  completed,
  streak,
  disabled,
  onToggle,
}: {
  habit: HabitWithAreas;
  completed: boolean;
  /** Null on non-today dates: a current streak is a property of today. */
  streak: StreakDisplay | null;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cn(ROW, tintFor(habit.id))}>
      <CheckCircle completed={completed} disabled={disabled} onClick={onToggle} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-meta font-semibold",
            completed ? "text-[var(--ink-faint)] line-through" : "text-[var(--ink)]"
          )}
        >
          {habit.name}
        </p>
        {habit.areas.length > 0 ? (
          <p className="mt-1 truncate text-micro text-[var(--ink-faint)]">
            {habit.areas.map((a) => `${a.emoji ?? ""} ${a.name}`.trim()).join(" · ")}
          </p>
        ) : null}
      </div>
      {streak ? <StreakChip streak={streak} /> : null}
    </div>
  );
}

/** Functional-amber streak accent, visible from day one (streak ≥ 1). */
function StreakChip({ streak }: { streak: StreakDisplay }) {
  if (streak.value < 1) return null;
  const label = streak.saturated ? `${streak.value}+` : String(streak.value);
  const days = streak.value === 1 && !streak.saturated ? "day" : "days";
  return (
    <Chip icon={<Flame size={11} />} tone="var(--ink-amber)" className="shrink-0">
      <span className="tabular-nums" aria-label={`${label} ${days} streak`}>
        {label}
      </span>
    </Chip>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// All habits — manage list (edit, archive, delete) + archived reveal
// ──────────────────────────────────────────────────────────────────────────

function ManageHabitRow({
  habit,
  streak,
  onEdit,
  onArchive,
  onDelete,
}: {
  habit: HabitWithAreas;
  streak: StreakDisplay;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const metaParts = [
    scheduleLabel(habit.daysOfWeek),
    ...habit.areas.map((a) => `${a.emoji ?? ""} ${a.name}`.trim()),
  ];
  return (
    <div className={cn(ROW, tintFor(habit.id))}>
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col text-left cursor-pointer-always"
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-meta font-semibold text-[var(--ink)]">{habit.name}</span>
          <StreakChip streak={streak} />
        </span>
        <span className="mt-1 truncate text-micro text-[var(--ink-faint)]">
          {metaParts.join(" · ")}
        </span>
      </button>
      <HabitRowMenu variant="active" onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
    </div>
  );
}

function ArchivedHabitRow({
  habit,
  onRestore,
  onDelete,
}: {
  habit: HabitWithAreas;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={ROW}>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-meta font-semibold text-[var(--ink-muted)]">{habit.name}</p>
        <p className="mt-1 truncate text-micro text-[var(--ink-faint)]">
          Created {prettyDate(habit.createdAt)}
          {habit.archivedAt ? ` · Archived ${prettyDate(habit.archivedAt)}` : ""}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="rounded-lg" onClick={onRestore}>
        <ArchiveRestore size={13} /> Restore
      </Button>
      <HabitRowMenu
        variant="archive"
        onEdit={onRestore}
        onArchive={onRestore}
        onDelete={onDelete}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared bits
// ──────────────────────────────────────────────────────────────────────────

function CheckCircle({
  completed,
  disabled,
  onClick,
}: {
  completed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={completed}
      aria-label={completed ? "Mark not done" : "Mark done"}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2",
        "cursor-pointer-always transition-colors duration-[160ms] ease-out",
        // Filled state rides the habit's own tint edge (falls back to the
        // app accent outside a tinted row). White check on the saturated fill.
        completed
          ? "border-transparent bg-[var(--tint-edge,var(--accent))] text-white"
          : "border-[color-mix(in_srgb,var(--tint-edge,var(--edge-strong))_60%,var(--edge-strong))] bg-[var(--tint-bg,transparent)] hover:border-[var(--tint-edge,var(--ink-faint))]",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      <motion.span
        initial={false}
        animate={reduced ? undefined : completed ? { scale: [1, 1.22, 1] } : { scale: 1 }}
        transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
        className="inline-flex"
      >
        {completed ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] cursor-pointer-always"
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
