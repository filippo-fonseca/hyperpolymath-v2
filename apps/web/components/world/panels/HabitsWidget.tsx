"use client";

/**
 * HabitsWidget.tsx — W-10 · The Studiolo · The Bottega (Phase 3) · habits-widget
 *
 * Today's habit grid, togglable from the world (PHASE-3-PLAN §W-10, §1.2). One
 * row per ACTIVE habit — the habit's name + a per-day tick strip for the
 * trailing 7 days, rendered into the W-03 `<WorldPanel>` primitive. A filled
 * cell = a completion; there are NO glyphs (uikit's Inter MSDF atlas has glyph
 * gaps, the TasksWidget precedent), so a bordered/filled uikit `<Container>`
 * carries the mark. Today's rightmost cell is the interactive `<Button>`.
 *
 * THE TOGGLE IS THE REAL ONE. Ticking today calls the SAME server action the 2D
 * `/habits` client uses — `toggleHabitCompletion({ habitId, completedDate,
 * completed })` — with the SAME self-reconciling optimistic overlay
 * (`useOptimisticList` over the completion rows, keyed `${habitId}::${date}`)
 * and the SAME cache invalidation (`invalidateQueries` on
 * `[...tableKey("habit_completions", userId), windowStart, today]`). That is the
 * exact key the WorldDataProvider observes, so a tick here refetches the shared
 * TanStack Query cache and the 2D grid updates live — and vice versa. The whole
 * mutation + completion-overlay + 7-day-strip derivation below is COPIED VERBATIM
 * from `HabitsClient.tsx` (handleToggle ~206–238, ManageHabitRow strip ~636–655);
 * nothing is invented. The 2D client computes no "streak", so this widget shows
 * no streak caption (the §W-10 "copy the derivation; don't invent" rule).
 *
 * PERF (§6/§7, the TodayPanel doctrine inherited via TasksWidget): the row list
 * and each 7-day strip are derived in RENDER, memoized on data/interaction
 * identity, never per frame. Rows are capped at `PANEL_ROW_CAP` with an "and N
 * more" footer so uikit never lays out an unbounded tree. The primitive owns the
 * frame, the LOD split, and the honesty states; this file adds no `useFrame`, no
 * ref mutation, no `invalidate()`.
 */

import { type JSX, useCallback, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@react-three/uikit-default";
import { Container, Text } from "@react-three/uikit";
import { toggleHabitCompletion } from "@/app/actions/habits";
import { tableKey } from "@/lib/realtime/query-keys";
import type { OptimisticAction } from "@/lib/realtime/optimistic-reducer";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { addDaysISO, parseISODate, toISODate } from "../../habits/date-utils";
import { useWorldData } from "../data/useWorldData";
import { STUDIOLO } from "../materials/tokens";
import {
  PANEL_ROW_CAP,
  WorldPanel,
  type DragHandleProps,
} from "./WorldPanel";
import type { WidgetComponentProps } from "./widgetRegistry";

/** uikit/R3F pointer events expose `stopPropagation`; that's all we need. */
type PanelClick = (event: { stopPropagation: () => void }) => void;

/** A completion row lifted to the `{ id }` shape `useOptimisticList` needs. */
type Completion = { habitId: string; completedDate: string; id: string };

/** One cell of the trailing-7-day tick strip (VERBATIM from ManageHabitRow). */
interface StripCell {
  iso: string;
  scheduled: boolean;
  done: boolean;
  preCreation: boolean;
}

const STRIP_DAYS = 7;
const CELL = 14; // world-uikit px; a compact tick square
const CELL_RADIUS = 4;

/**
 * The rig hands each widget `{ slot, focused, lod }` (W-01's
 * `WidgetComponentProps`); W-07's drag wiring is threaded separately as an
 * optional `dragHandleProps` and passed straight through to `<WorldPanel>` —
 * mirrors TasksWidget exactly.
 */
interface HabitsWidgetProps extends WidgetComponentProps {
  dragHandleProps?: DragHandleProps;
}

export function HabitsWidget({
  slot,
  focused,
  lod,
  dragHandleProps,
}: HabitsWidgetProps): JSX.Element {
  const { userId, habits: habitsData, todayYmd } = useWorldData();
  const { habits, completions, windowStart } = habitsData;
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  // ── Optimistic completion overlay — COPIED VERBATIM from HabitsClient ──────
  // (HabitsClient.tsx ~181–204). Completion rows lifted to a stable `id`, then
  // wrapped in the RT-06 self-reconciling overlay so a toggle persists until the
  // canonical range query catches up (no off-and-on flicker under a slow refetch
  // or Realtime echo).
  const completionRows: Completion[] = useMemo(
    () =>
      completions.map((c) => ({
        ...c,
        id: `${c.habitId}::${c.completedDate}`,
      })),
    [completions],
  );
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

  // ── The toggle — COPIED VERBATIM from HabitsClient.handleToggle (~206–238) ──
  // The invalidated key is the exact one WorldDataProvider observes, so the tick
  // flows DB → Supabase Realtime → the shared TanStack Query cache → the 2D grid
  // (and vice versa). `today`/`windowStart` come from the provider (its minute
  // clock) instead of the 2D client's local `nowISO()` state.
  const handleToggle = useCallback(
    (habitId: string, date: string) => {
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
          addCompletionOptimistic({ type: "revert", id: key });
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: [
            ...tableKey("habit_completions", userId),
            windowStart,
            todayYmd,
          ],
        });
      });
    },
    [
      completionSet,
      addCompletionOptimistic,
      queryClient,
      userId,
      windowStart,
      todayYmd,
    ],
  );

  const visible = habits.slice(0, PANEL_ROW_CAP);
  const overflow = habits.length - visible.length;

  // Glanceable chip: how many of today's habits are kept so far.
  const keptToday = habits.filter((h) => isCompleted(h.id, todayYmd)).length;

  return (
    <WorldPanel
      widgetId="habits"
      title="Habits"
      countChip={
        habits.length > 0 ? `${keptToday}/${habits.length} kept` : undefined
      }
      status={habits.length === 0 ? "empty" : "ready"}
      emptyLine="No habits kept yet."
      focused={focused}
      lod={lod}
      slot={slot}
      dragHandleProps={dragHandleProps}
    >
      {visible.map((habit) => (
        <HabitRow
          key={habit.id}
          name={habit.name}
          strip={buildStrip(habit, todayYmd, isCompleted)}
          onToggleToday={() => handleToggle(habit.id, todayYmd)}
        />
      ))}

      {overflow > 0 ? (
        <Container paddingY={6}>
          <Text
            fontSize={9}
            letterSpacing={0.5}
            color={STUDIOLO.parchment}
            opacity={0.5}
          >
            {`and ${overflow} more — press Cmd+\\`}
          </Text>
        </Container>
      ) : null}
    </WorldPanel>
  );
}

/**
 * Trailing-7-day strip for one habit — COPIED VERBATIM from HabitsClient's
 * ManageHabitRow (~636–655): iterate i = 6…0 so the rightmost cell is today,
 * clamp by `createdAt` (pre-creation days render as "didn't exist"), and a day
 * counts done only when it is both post-creation and in the completion set.
 */
function buildStrip(
  habit: { id: string; daysOfWeek: boolean[]; createdAt: Date },
  today: string,
  isCompleted: (habitId: string, date: string) => boolean,
): StripCell[] {
  const createdISO = toISODate(habit.createdAt);
  const out: StripCell[] = [];
  for (let i = STRIP_DAYS - 1; i >= 0; i--) {
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
}

function HabitRow({
  name,
  strip,
  onToggleToday,
}: {
  name: string;
  strip: StripCell[];
  onToggleToday: () => void;
}): JSX.Element {
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      gap={8}
      paddingY={6}
      borderBottomWidth={1}
      borderColor={STUDIOLO.sepiaInk}
    >
      <Container flexGrow={1} flexShrink={1}>
        <Text fontSize={13} color={STUDIOLO.parchment}>
          {name}
        </Text>
      </Container>
      <Container flexDirection="row" gap={4} alignItems="center">
        {strip.map((cell, idx) => {
          const isToday = idx === strip.length - 1;
          if (isToday) {
            // Today's cell is the live toggle. Filled candleflame when kept;
            // otherwise a candleflame ring (uikit exposes one per-element
            // `opacity`, so a kept cell simply reads brighter than an empty one).
            return (
              <Button
                key={cell.iso}
                variant="ghost"
                size="icon"
                width={CELL}
                height={CELL}
                borderRadius={CELL_RADIUS}
                borderWidth={1}
                borderColor={STUDIOLO.candleflame}
                backgroundColor={
                  cell.done ? STUDIOLO.candleflame : undefined
                }
                opacity={cell.done ? 0.95 : 0.85}
                onClick={
                  ((e) => {
                    e.stopPropagation();
                    onToggleToday();
                  }) as PanelClick
                }
              />
            );
          }
          // Prior days are read-only marks (no glyphs — fill/border only). uikit
          // has one per-element `opacity`, so cell state is carried by fill +
          // border color + dim (verbatim intent from ManageHabitRow's strip).
          const border = cell.preCreation
            ? STUDIOLO.sepiaInk
            : cell.done
              ? STUDIOLO.candleflame
              : cell.scheduled
                ? STUDIOLO.brass
                : STUDIOLO.sepiaInk;
          return (
            <Container
              key={cell.iso}
              width={CELL}
              height={CELL}
              borderRadius={CELL_RADIUS}
              borderWidth={1}
              borderColor={border}
              backgroundColor={cell.done ? STUDIOLO.candleflame : undefined}
              opacity={
                cell.done
                  ? 0.85
                  : cell.preCreation
                    ? 0.4
                    : cell.scheduled
                      ? 0.8
                      : 0.5
              }
            />
          );
        })}
      </Container>
    </Container>
  );
}

export default HabitsWidget;
