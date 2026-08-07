"use client";

import {
  type HabitDockToday,
  type HabitWithAreas,
  deleteHabit,
  getArchivedHabitsForCurrentUser,
  getHabitCompletionsInRange,
  getHabitsForCurrentUser,
  updateHabit,
} from "@/app/actions/habits";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { SidePanel } from "@/components/ui/SidePanel";
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
import { HABIT_STATUS_LABEL, type HabitStatus } from "@/lib/habits/status";
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
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HabitCheckRow, buildTrail } from "./HabitCheckRow";
import { type AreaOption, HabitDialog } from "./HabitDialog";
import { HabitWeekPicker } from "./HabitWeekPicker";
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
  initialTodayCompletions: {
    habitId: string;
    completedDate: string;
    status: HabitStatus;
  }[];
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
/** aug-07: bare rows on the sheet, per Craft §5. These are the MANAGE rows
 *  (inside the side panel); the daily check-off rows live in HabitCheckRow.
 *  Composed with tintFor(habit.id) so a row's accents pick up the habit's own
 *  pastel via var(--tint-…). */
const ROW =
  "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]";

/**
 * /habits — the daily loop on the stage, and nothing else.
 *
 * The page used to promise this split in prose while breaking it in layout:
 * "Today" and "All habits" were stacked in one scroll using the identical row
 * chrome, so a surface you touch every morning and a surface you touch once a
 * month competed for the same attention. That is most of why it did not feel
 * intuitive.
 *
 * Now the page IS the check-off surface — day pills, bare rows, one tap to
 * complete — and managing habits (edit, archive, delete, restore) opens in a
 * side panel. The archive list is still fetched lazily, only on reveal.
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
  const [manageOpen, setManageOpen] = useState(false);
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

  // The seven-day strip in each row needs statuses for the whole window, which
  // the per-day hooks do not carry. One range read, shared by every row, keyed
  // on the window so paging the week refetches once rather than per habit.
  const trailStart = addDaysISO(selectedDate, -6);
  const { data: trailRows = [] } = useQuery({
    queryKey: [...tableKey("habit_completions", userId), trailStart, selectedDate],
    queryFn: () => getHabitCompletionsInRange(trailStart, selectedDate),
  });
  const trailStatus = useMemo(() => {
    const m = new Map<string, HabitStatus>();
    for (const r of trailRows) m.set(`${r.habitId}::${r.completedDate}`, r.status);
    return m;
  }, [trailRows]);
  const statusOnDay = useCallback(
    (habitId: string, iso: string): HabitStatus => {
      // The selected day reads from the optimistic overlay so a tap updates
      // its own dot immediately; the rest come from the range fetch.
      if (iso === selectedDate) return selectedDay.statusOf(habitId);
      return trailStatus.get(`${habitId}::${iso}`) ?? "not_started";
    },
    [selectedDate, selectedDay, trailStatus]
  );

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
        <>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg"
            onClick={() => setManageOpen(true)}
          >
            <SlidersHorizontal size={14} /> Manage
          </Button>
          <Button size="sm" className="rounded-lg" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> New habit
          </Button>
        </>
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
              statusOf={selectedDay.statusOf}
              statusOnDay={statusOnDay}
              onToggle={selectedDay.toggle}
              onSetStatus={selectedDay.setStatus}
              streakOf={streakOf}
            />
          </PageScaffold.Section>
        </>
      )}

      {/* Management lives OFF the daily path. The page's own docstring already
          claimed this split ("Today = check-off, All habits = manage") while
          rendering both sections stacked in one scroll, with identical row
          chrome — so the daily loop and the CRUD surface competed for the same
          attention. The panel is the split made real: check-off is the page,
          managing is something you open. */}
      <SidePanel
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="Manage habits"
        width={360}
        actions={
          <Button size="sm" className="rounded-lg" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> New
          </Button>
        }
      >
        <div className="flex flex-col gap-4 p-3">
          <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]">
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

          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="w-fit cursor-pointer-always rounded-lg px-1.5 py-1 text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>

          {showArchived ? (
            archivedPending ? (
              <p className="text-meta text-[var(--ink-faint)]">Loading…</p>
            ) : archived.length === 0 ? (
              <EmptyState size="inline" title="Nothing archived yet." />
            ) : (
              <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]">
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
            )
          ) : null}
        </div>
      </SidePanel>

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
// The check-off surface. Day pills, then bare rows. Nothing here edits,
// archives, or deletes — that lives in the Manage panel, which is the whole
// point of the split (see the component docstring).
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
  statusOf,
  statusOnDay,
  onToggle,
  onSetStatus,
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
  statusOf: (habitId: string) => HabitStatus;
  /** Status for any date in the trail window. */
  statusOnDay: (habitId: string, iso: string) => HabitStatus;
  onToggle: (habitId: string) => void;
  onSetStatus: (habitId: string, next: HabitStatus) => void;
  streakOf: (habitId: string) => StreakDisplay;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HabitWeekPicker selectedDate={selectedDate} today={today} onSelectDate={onSelectDate} />
        {habits.length > 0 ? (
          <span className="shrink-0 text-micro tabular-nums text-[var(--ink-faint)]">
            {doneCount}/{habits.length} done
          </span>
        ) : null}
      </div>

      {isFuture ? (
        <p className="text-meta text-[var(--ink-muted)]">
          This day has not started yet; check-off opens on the day.
        </p>
      ) : null}

      {habits.length === 0 ? (
        <EmptyState
          size="inline"
          title={isPast ? "Nothing was scheduled this day." : "Nothing scheduled for this day."}
        />
      ) : (
        // Hairline separators belong to the LIST, not to each row — that is
        // what turns ten rows into one list instead of ten cards.
        <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]">
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
                <HabitCheckRow
                  id={h.id}
                  name={h.name}
                  emoji={h.icon}
                  status={statusOf(h.id)}
                  streak={isToday ? streakOf(h.id).value : 0}
                  streakSaturated={isToday ? streakOf(h.id).saturated : false}
                  trail={buildTrail(h.daysOfWeek, (iso) => statusOnDay(h.id, iso), selectedDate)}
                  disabled={isFuture}
                  onToggle={() => onToggle(h.id)}
                  onSetStatus={(next) => onSetStatus(h.id, next)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/**
 * Craft §3: "dates/counts/priorities are bare colored TEXT or a size-1.5 dot —
 * never a filled pill." This was a filled Chip, which read as an entity badge
 * rather than as the metadata it is.
 */
function StreakChip({ streak }: { streak: StreakDisplay }) {
  if (streak.value < 1) return null;
  const label = streak.saturated ? `${streak.value}+` : String(streak.value);
  const days = streak.value === 1 && !streak.saturated ? "day" : "days";
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-micro tabular-nums"
      style={{ color: "var(--ink-amber)" }}
      aria-label={`${label} ${days} streak`}
    >
      <Flame size={11} aria-hidden />
      {label}
    </span>
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
