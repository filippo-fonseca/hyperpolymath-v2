"use client";

/**
 * TodayPanel.tsx — U-12 · The Studiolo · today-panel
 *
 * ONE floating holographic panel at the dais listing today's + overdue tasks,
 * with a working complete-from-world affordance. Built on `@react-three/uikit`
 * (`<Root>`/`<Container>`/`<Text>`) plus the uikit-default `<Button>` for the
 * per-row check. Journal-paper/holographic skin from the STUDIOLO tokens:
 * parchment text on a translucent deep-vellum slab, brass accents, coral for
 * the overdue tick.
 *
 * THE COMPLETION IS THE REAL ONE. Checking a row calls the SAME server action
 * the 2D `UpcomingTasksWidget` uses — `updateTaskStatus({ id, newStatus:
 * "lesno" })` from `app/actions/tasks.ts` — with the SAME optimistic pattern
 * (local `checkedOff` Set to slide the row out) and the SAME cache invalidation
 * (`queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) })`).
 * That mutation flows DB → Supabase Realtime → the shared TanStack Query cache
 * (WorldDataProvider observes the identical key) → the U-04 differ sees the row
 * go `lesno` → emits `task-completed` → U-09's ember ascends with the bell.
 * This panel deliberately does NOTHING on success beyond the invalidate; the
 * ascent choreography is not ours to trigger.
 *
 * PERF (PLAN §6/§7): the row list is derived in RENDER (memoized on
 * data/interaction identity), never per-frame. uikit owns its own draw batches;
 * we keep the tree modest — rows capped at 12 with an "and N more" footer — so
 * uikit's 1.0.x allocation hotpath (TECH.md risk) is never fed a churning tree.
 * No prop changes happen per frame: content mutates only when the tasks query
 * refetches or the local optimistic Set changes. uikit invalidates R3F frames
 * on its own updates (pointer hover, layout) and does NOT spin rAF while idle in
 * demand mode — it requests a frame per discrete change, then sleeps.
 */

import { type JSX, useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Container, Root, Text } from "@react-three/uikit";
import { Button } from "@react-three/uikit-default";
import { updateTaskStatus } from "@/app/actions/tasks";
import { tableKey } from "@/lib/realtime/query-keys";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { classifyTask, type EmberState } from "../data/mappings";
import { useWorldData } from "../data/useWorldData";
import { STUDIOLO } from "../materials/tokens";

// PLAN §6: cap the rendered rows so uikit never lays out an unbounded tree.
const ROW_CAP = 12;

/**
 * Fixed dais placement, facing the vestibule. The vestibule pose sits on the
 * +z axis at [0, 1.6, 6] looking back at the trunk (CameraRig.VESTIBULE_POSE),
 * so the panel floats to the LEFT of the trunk base, angled toward that entry
 * eye-line. A FIXED pose (not camera-attached) is deliberate: a panel that
 * tracked the camera would need a per-frame transform write, breaking the
 * "no per-frame work" contract and the demand-mode idle. Static it is.
 */
const PANEL_POSITION: [number, number, number] = [-1.85, 1.5, 1.5];
const PANEL_ROTATION: [number, number, number] = [0, 0.42, 0];

// Overdue sorts before today; within a state, earlier due-date first.
function stateRank(state: EmberState): number {
  return state === "overdue" ? 0 : 1;
}

/** uikit/R3F pointer events expose `stopPropagation`; that's all we need. */
type PanelClick = (event: { stopPropagation: () => void }) => void;

export function TodayPanel(): JSX.Element {
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

  const visible = rows.slice(0, ROW_CAP);
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
    <group position={PANEL_POSITION} rotation={PANEL_ROTATION}>
      <Root
        sizeX={1.6}
        sizeY={1.1}
        flexDirection="column"
        padding={24}
        gap={10}
        borderRadius={16}
        backgroundColor={STUDIOLO.deepVellum}
        // uikit 1.0.73 exposes a single per-element `opacity` (no separate
        // `backgroundOpacity`/`borderOpacity` in the typed API), so the whole
        // slab reads translucent — which is exactly the holographic intent.
        opacity={0.7}
        borderWidth={1}
        borderColor={STUDIOLO.brass}
      >
        {/* Header — brass rule beneath a serif-weight caption. */}
        <Container
          flexDirection="row"
          alignItems="flex-end"
          justifyContent="space-between"
        >
          <Text fontSize={16} fontWeight="bold" color={STUDIOLO.parchment}>
            Today
          </Text>
          {rows.length > 0 ? (
            <Text
              fontSize={10}
              letterSpacing={1}
              color={STUDIOLO.brass}
              opacity={0.85}
            >
              {`${rows.length} due`}
            </Text>
          ) : null}
        </Container>
        <Container height={1} backgroundColor={STUDIOLO.brass} opacity={0.3} />

        {visible.length === 0 ? (
          // Empty state — italic, per PLAN acceptance.
          <Container flexGrow={1} justifyContent="center" alignItems="flex-start">
            {/* Empty state, softened to read as a quiet aside. uikit 1.0.73 has
                no `fontStyle`/italic variant on the default font, so the
                journal-italic intent is carried by the dimmed weight instead. */}
            <Text fontSize={13} color={STUDIOLO.parchment} opacity={0.6}>
              The day is clear.
            </Text>
          </Container>
        ) : (
          <Container overflow="scroll" flexGrow={1} flexDirection="column" gap={2}>
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
                    <Text fontSize={11} color={tick}>
                      ○
                    </Text>
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
          </Container>
        )}
      </Root>
    </group>
  );
}

export default TodayPanel;
