"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
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
} from "lucide-react";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
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

// Glassy pill tile — matches the PROFILE pill in SettingsSectionNav.
// Translucent surface + backdrop-blur + inset cyan glow + soft outer halo
// + thin cyan-tinged border. Hover lifts the halo and warms the cyan inset.
const TILE_NEUMORPHIC =
  "rounded-xl " +
  "glass-tile " +
  "";

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
  const [optimisticCompletions, addCompletionOptimistic] = useOptimistic(
    completionRows,
    optimisticReducer<Completion>,
  );

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
      {/* Tab strip + primary action */}
      <div className="flex items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Habits view"
          className="flex items-center gap-0.5 border border-[var(--edge)] rounded-md p-0.5 bg-[var(--surface)] w-fit"
        >
          <TabButton active={tab === "today"} onClick={() => setTab("today")}>
            Today
          </TabButton>
          <TabButton
            active={tab === "manage"}
            onClick={() => setTab("manage")}
          >
            Manage{" "}
            <span className="tabular-nums text-[var(--ink-muted)] ml-1">
              ({habits.length})
            </span>
          </TabButton>
          <TabButton
            active={tab === "archive"}
            onClick={() => setTab("archive")}
          >
            Archive{" "}
            <span className="tabular-nums text-[var(--ink-muted)] ml-1">
              ({archived.length})
            </span>
          </TabButton>
        </div>
        <Button size="sm"onClick={() => setCreateOpen(true)}>
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

  // Auto-snap to "today"if the day rolls over while we were on yesterday.
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
      {/* Day navigator — prev / label+calendar / next, with a "Today"reset
          on the right when off-today. */}
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
                className="font-serif font-semibold text-[18px] leading-none px-2"
              >
                <CalendarIcon
                  size={13}
                  className="opacity-70 mr-1.5"
                  aria-hidden="true"
                />
                {formatDateLabel(selectedDate, today)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start"className="w-auto p-3">
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
        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
          {completedCount} / {dayHabits.length}
        </span>
      </div>

      {/* Past / future hint band. Future = warning (can't check off yet);
          past = neutral muted (can backfill). */}
      {isFuture ? (
        <div className="rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-2 font-serif italic text-[12px] text-[var(--ink-muted)]">
          Viewing a future day — check-off is enabled but won't change today's
          counts.
        </div>
      ) : null}

      {dayHabits.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-10 text-center">
          <p className="font-serif italic text-[15px] text-[var(--ink-muted)]">
            {habits.length === 0
              ? "No habits yet — add one to begin."
              : isPast
                ? "Nothing was scheduled this day, or all your habits were created later."
                : "Nothing scheduled for this day."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout"initial={false}>
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
  onToggle,
}: {
  habit: HabitWithAreas;
  completed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        completed
          ? "rounded-xl glass-tile border-[color-mix(in_oklch,var(--ink-amber)_45%,var(--edge))] bg-[color-mix(in_oklch,var(--ink-amber)_8%,var(--surface))] [--glass-glow-color:var(--ink-amber)] [--glass-glow:8%]"
          : TILE_NEUMORPHIC,
      )}
    >
      <CheckCircle completed={completed} onClick={onToggle} />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "font-serif text-[16px] truncate",
            completed
              ? "text-[var(--ink-muted)] line-through"
              : "text-[var(--ink)]",
          )}
        >
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
    </div>
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
      <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-12 text-center">
        <p className="font-serif italic text-base text-[var(--ink-muted)]">
          Habits you build here repeat on the days you pick.
        </p>
        <Button className="mt-4"size="sm"onClick={onCreate}>
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
  // "didn't exist" (no border, faint) to make the "habit is new"honest.
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

  return (
    <div
      className={cn("flex items-center gap-3 px-4 py-3", TILE_NEUMORPHIC)}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex flex-col min-w-0 flex-1 text-left"
      >
        <p className="font-serif text-[15px] text-[var(--ink)] truncate">
          {habit.name}
        </p>
        {habit.description ? (
          <p className="font-serif text-[12px] text-[var(--ink-muted)] truncate mt-0.5">
            {habit.description}
          </p>
        ) : null}
        {habit.areas.length > 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] mt-1 truncate">
            {habit.areas
              .map((a) => `${a.emoji ?? ""} ${a.name}`.trim())
              .join(" · ")}
          </p>
        ) : null}
      </button>

      <HabitFrequencyBadges value={habit.daysOfWeek} />

      <div className="flex items-center gap-0.5 ml-3">
        {strip.map((d) => (
          <span
            key={d.iso}
            title={
              d.preCreation
                ? `${d.iso} · before creation`
                : `${d.iso}${d.scheduled ? "" : " · not scheduled"}${d.done ? " · done" : ""}`
            }
            className={cn(
              "inline-block w-2 h-2 rounded-full",
              d.preCreation
                ? "bg-transparent border border-[var(--edge)]/30"
                : d.done
                  ? "bg-[var(--ink-amber)]"
                  : d.scheduled
                    ? "bg-transparent border border-[var(--ink-muted)]/40"
                    : "bg-transparent border border-[var(--edge)]/60",
            )}
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
      <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-12 text-center">
        <p className="font-serif italic text-base text-[var(--ink-muted)]">
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
          className={cn("flex items-center gap-3 px-4 py-3", TILE_NEUMORPHIC)}
        >
          <div className="flex flex-col min-w-0 flex-1">
            <p className="font-serif text-[15px] text-[var(--ink-muted)] truncate">
              {h.name}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] mt-1">
              Created {prettyDate(h.createdAt)}
              {h.archivedAt
                ? `  ·  Archived ${prettyDate(h.archivedAt)}`
                : null}
            </p>
            {h.areas.length > 0 ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]/80 mt-0.5 truncate">
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={completed}
      aria-label={completed ? "Mark not done" : "Mark done"}
      className={cn(
        "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border-2",
        "transition-colors duration-150 ease-out cursor-pointer-always",
        completed
          ? "border-[var(--ink-amber)] bg-[var(--ink-amber)] text-[var(--canvas)]"
          : "border-[var(--edge)] bg-transparent hover:border-[var(--ink-amber)]",
      )}
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
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer-always"
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
        <DropdownMenuItem variant="destructive"onClick={onDelete}>
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
        "inline-flex items-center px-3 py-1 rounded-sm font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
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
