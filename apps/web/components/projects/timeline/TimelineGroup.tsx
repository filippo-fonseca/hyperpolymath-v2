"use client";

/**
 * `TimelineGroup` — one area section: a label row plus one lane per project.
 *
 * At `scope="area"` (u5's reuse) the label row is suppressed via
 * `showAreaHeader={false}` — the page header already names the area, and
 * repeating it above a single group would be noise.
 *
 * The area label is `sticky left-0` so it survives a deep horizontal scroll;
 * it is the anchor that tells you which area a lane belongs to. That is also
 * why `.timeline-edge-fade` fades the trailing edge only.
 *
 * Motion (§14): entrance is opacity/y over 160ms with the standard
 * stagger, `useReducedMotion()`-guarded. Nothing here animates width — zoom
 * changes re-layout instantly rather than tweening a lane's geometry.
 */

import { motion, useReducedMotion } from "motion/react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  ProjectBarPopover,
  type TimelineDatePatch,
} from "@/components/projects/timeline/ProjectBarPopover";
import { TimelineBar } from "@/components/projects/timeline/TimelineBar";
import type { DragMode } from "@/components/projects/timeline/drag-plan";
import {
  type TimelineGroup as TimelineGroupData,
  type TimelineRowProject,
  type TimelineWindow,
  barGeometry,
} from "@/lib/projects/timeline";
import { cn } from "@/lib/utils";

export const TIMELINE_ROW_HEIGHT_PX = 32;
export const TIMELINE_BAR_HEIGHT_PX = 14;
export const TIMELINE_AREA_ROW_HEIGHT_PX = 30;

interface Props {
  group: TimelineGroupData;
  timelineWindow: TimelineWindow;
  todayISO: string;
  totalWidthPx: number;
  showAreaHeader: boolean;
  openProjectId: string | null;
  onSetOpen: (projectId: string | null) => void;
  onCommitDates: (project: TimelineRowProject, patch: TimelineDatePatch) => void;
  /** Pointer path to u4's drag session; absent → bars are click-only. */
  onBeginDrag?: (
    project: TimelineRowProject,
    mode: DragMode,
    event: ReactPointerEvent<HTMLElement>
  ) => void;
  /** Running row index across all groups, for the entrance stagger. */
  rowIndexOffset: number;
}

export function TimelineGroup({
  group,
  timelineWindow,
  todayISO,
  totalWidthPx,
  showAreaHeader,
  openProjectId,
  onSetOpen,
  onCommitDates,
  onBeginDrag,
  rowIndexOffset,
}: Props) {
  const reduceMotion = useReducedMotion();

  const entrance = (index: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.16,
            delay: Math.min(index, 24) * 0.01,
            ease: [0.25, 1, 0.5, 1] as const,
          },
        };

  return (
    <div data-testid="timeline-group" data-area-id={group.area.id}>
      {showAreaHeader && (
        <motion.div
          {...entrance(rowIndexOffset)}
          className="relative flex items-center border-[var(--sd-line)] border-b bg-[var(--sd-box)]"
          style={{ width: totalWidthPx, height: TIMELINE_AREA_ROW_HEIGHT_PX }}
        >
          <div className="sticky left-0 z-[2] flex items-center gap-2 bg-[var(--sd-box)] py-1 pr-4 pl-3">
            {group.area.emoji ? (
              <span className="shrink-0 text-meta leading-none" aria-hidden="true">
                {group.area.emoji}
              </span>
            ) : null}
            <span className="text-meta font-semibold text-[var(--sd-ink)] leading-none">
              {group.area.name}
            </span>
            <span className="font-medium text-micro text-[var(--ink-faint)] tabular-nums leading-none">
              {group.projects.length} {group.projects.length === 1 ? "project" : "projects"}
            </span>
          </div>
        </motion.div>
      )}

      {group.projects.length === 0 ? (
        <div
          className="relative flex items-center border-[var(--sd-line)] border-b"
          style={{ width: totalWidthPx, height: TIMELINE_ROW_HEIGHT_PX }}
          data-testid="timeline-empty-lane"
        >
          <span className="sticky left-0 pl-3 font-sans text-micro font-medium text-[var(--ink-faint)]">
            No projects
          </span>
        </div>
      ) : (
        group.projects.map((project, index) => {
          const geometry = barGeometry(project, timelineWindow, todayISO);
          const isOpen = openProjectId === project.id;
          return (
            <motion.div
              key={project.id}
              {...entrance(rowIndexOffset + index + 1)}
              className={cn(
                "relative overflow-hidden border-[var(--sd-line)] border-b",
                // Selection is a neutral backplate on the row, never an
                // accent-filled row or an accent ring (§37).
                isOpen && "bg-[var(--sd-selected)]"
              )}
              style={{ width: totalWidthPx, height: TIMELINE_ROW_HEIGHT_PX }}
              data-testid="timeline-row"
              data-project-row-id={project.id}
            >
              {/* Lane track — the rail the bar rides on. */}
              <span
                aria-hidden="true"
                className="-translate-y-1/2 absolute inset-x-0 top-1/2 rounded-full bg-[var(--sd-input)]"
                style={{ height: TIMELINE_BAR_HEIGHT_PX }}
              />
              {/* The bar IS the popover's anchor, so the panel opens on the
                  span it describes rather than on some detached element. */}
              <ProjectBarPopover
                project={project}
                open={isOpen}
                onOpenChange={(next) => onSetOpen(next ? project.id : null)}
                onCommitDates={(patch) => onCommitDates(project, patch)}
                todayISO={todayISO}
              >
                <TimelineBar
                  project={project}
                  geometry={geometry}
                  isOpen={isOpen}
                  onOpen={onSetOpen}
                  heightPx={TIMELINE_BAR_HEIGHT_PX}
                  onBeginDrag={
                    onBeginDrag ? (mode, event) => onBeginDrag(project, mode, event) : undefined
                  }
                />
              </ProjectBarPopover>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
