"use client";

/**
 * TasksWidget.tsx — W-05 · The Studiolo · The Bottega (Phase 3) · tasks-widget
 *
 * The first bench citizen: TodayPanel's content, VERBATIM in behavior, rendered
 * into the W-03 `<WorldPanel>` primitive (PHASE-3-PLAN §W-05). Everything the
 * lone TodayPanel proved — today + overdue tasks, overdue-first sort, the
 * optimistic `checkedOff` Set, the REAL completion via `updateTaskStatus` + the
 * SAME `invalidateQueries(tableKey("tasks", userId))` — lives here unchanged;
 * only the frame/skin now belongs to the shared primitive.
 *
 * THE COMPLETION IS THE REAL ONE. Checking a row calls the SAME server action
 * the 2D `UpcomingTasksWidget` uses — `updateTaskStatus({ id, newStatus:
 * "lesno" })` — with the SAME optimistic pattern (a local `checkedOff` Set to
 * slide the row out) and the SAME cache invalidation (`queryClient
 * .invalidateQueries({ queryKey: tableKey("tasks", userId) })`). That mutation
 * flows DB → Supabase Realtime → the shared TanStack Query cache
 * (WorldDataProvider observes the identical key) → the U-04 differ sees the row
 * go `lesno` → emits `task-completed` → U-09's ember ascends with the bell.
 * This widget deliberately does NOTHING on success beyond the invalidate; the
 * ascent choreography is upstream and not ours to trigger.
 *
 * PERF (§6/§7, inherited from TodayPanel): the row list is derived in RENDER
 * (memoized on data/interaction identity), never per-frame. Rows are capped at
 * `PANEL_ROW_CAP` with an "and N more" footer so uikit never lays out an
 * unbounded tree. No prop changes happen per frame: content mutates only when
 * the tasks query refetches or the local optimistic Set changes. The primitive
 * owns the frame, the LOD split, and the honesty states; this file adds no
 * `useFrame`, no ref mutation, no `invalidate()`.
 */

import { type JSX, useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@react-three/uikit-default";
import { Container, Text } from "@react-three/uikit";
import { updateTaskStatus } from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { classifyTask, type EmberState } from "../data/mappings";
import { useWorldData } from "../data/useWorldData";
import { STUDIOLO } from "../materials/tokens";
import {
  PANEL_ROW_CAP,
  WorldPanel,
  type DragHandleProps,
} from "./WorldPanel";
import type { WidgetComponentProps } from "./widgetRegistry";

// Overdue sorts before today; within a state, earlier due-date first.
function stateRank(state: EmberState): number {
  return state === "overdue" ? 0 : 1;
}

/** uikit/R3F pointer events expose `stopPropagation`; that's all we need. */
type PanelClick = (event: { stopPropagation: () => void }) => void;

/**
 * The rig hands each widget `{ slot, focused, lod }` (W-01's
 * `WidgetComponentProps`); W-07's drag wiring is threaded separately as an
 * optional `dragHandleProps` and passed straight through to `<WorldPanel>`.
 */
interface TasksWidgetProps extends WidgetComponentProps {
  dragHandleProps?: DragHandleProps;
}

export function TasksWidget({
  slot,
  focused,
  lod,
  dragHandleProps,
}: TasksWidgetProps): JSX.Element {
  const { userId, tasks, todayYmd } = useWorldData();
  const queryClient = useQueryClient();

  // Optimistic hide — mirrors UpcomingTasksWidget.handleCheck exactly. A row is
  // hidden the instant it is checked; cleared after the invalidate settles (or
  // on failure, so it snaps back).
  const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set());

  // Today + overdue, overdue-first. Recomputes only when the tasks array, the
  // day, or the optimistic Set changes — all interaction/data cadence, never
  // per frame. `lesno` (done) rows are excluded (their exit IS the ascent).
  const rows = useMemo<TaskWithProjects[]>(() => {
    const selected = tasks.filter((t) => {
      if (t.status === "lesno") return false;
      if (checkedOff.has(t.id)) return false;
      const state = classifyTask(t, todayYmd);
      return state === "today" || state === "overdue";
    });
    selected.sort((a, b) => {
      const ra = stateRank(classifyTask(a, todayYmd));
      const rb = stateRank(classifyTask(b, todayYmd));
      if (ra !== rb) return ra - rb;
      const da = a.dueDate ?? "";
      const db = b.dueDate ?? "";
      if (da !== db) return da < db ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return selected;
  }, [tasks, todayYmd, checkedOff]);

  const visible = rows.slice(0, PANEL_ROW_CAP);
  const overflow = rows.length - visible.length;

  const handleComplete = useCallback(
    async (task: TaskWithProjects) => {
      // Optimistic: slide the row out immediately.
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

      // Invalidate the SAME key WorldDataProvider observes → refetch → differ →
      // ember ascent. Delay + clear the optimistic id after, exactly like the
      // 2D widget, so the row never flickers back before the refetch lands.
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
    },
    [queryClient, userId],
  );

  return (
    <WorldPanel
      widgetId="tasks"
      title="Tasks"
      countChip={rows.length > 0 ? `${rows.length} due` : undefined}
      status={rows.length === 0 ? "empty" : "ready"}
      // Empty state — italic intent, per PLAN acceptance. The primitive renders
      // this as the quiet §2.8 aside when status === "empty".
      emptyLine="The day is clear."
      focused={focused}
      lod={lod}
      slot={slot}
      dragHandleProps={dragHandleProps}
    >
      {visible.map((task) => {
        const state = classifyTask(task, todayYmd);
        const overdue = state === "overdue";
        const project = task.projects[0];
        const tick = overdue ? STUDIOLO.emberAlarm : STUDIOLO.candleflame;
        return (
          <Container
            key={task.id}
            flexDirection="row"
            alignItems="center"
            gap={8}
            paddingY={6}
            borderBottomWidth={1}
            borderColor={STUDIOLO.sepiaInk}
          >
            <Button
              variant="ghost"
              size="icon"
              width={22}
              height={22}
              borderRadius={11}
              borderWidth={1}
              borderColor={tick}
              onClick={((e) => {
                e.stopPropagation();
                void handleComplete(task);
              }) as PanelClick}
            >
              {/* The empty-checkbox mark. Drawn as a uikit ring Container, NOT a
                  "○" glyph: uikit's Inter MSDF atlas has no U+25CB, so a text "○"
                  logs "Missing glyph info for character" per row and renders as
                  tofu. A bordered Container needs no glyph and preserves the
                  concentric "target" look inside the ring button. */}
              <Container
                width={8}
                height={8}
                borderRadius={4}
                borderWidth={1}
                borderColor={tick}
              />
            </Button>
            <Container flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text fontSize={13} color={STUDIOLO.parchment}>
                {task.title}
              </Text>
              <Container flexDirection="row" gap={6} alignItems="center">
                {project ? (
                  <Text
                    fontSize={9}
                    letterSpacing={0.5}
                    color={STUDIOLO.parchment}
                    opacity={0.55}
                  >
                    {project.name}
                  </Text>
                ) : null}
                <Text
                  fontSize={9}
                  letterSpacing={0.5}
                  color={overdue ? STUDIOLO.emberAlarm : STUDIOLO.brass}
                  opacity={overdue ? 0.9 : 0.7}
                >
                  {overdue ? `OVERDUE · ${task.priority}` : task.priority}
                </Text>
              </Container>
            </Container>
          </Container>
        );
      })}

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

export default TasksWidget;
