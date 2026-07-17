"use client";

/**
 * `ProjectsTimeline` — the composed surface: toolbar, scroller, header tiers,
 * area groups, today marker.
 *
 * Reusable at `scope="area"` (u5) from day one: that drops the area label rows
 * and nothing else, because the page header already names the area there.
 *
 * This component owns three things the pieces below it deliberately do not:
 *   1. Zoom (via useTimelineView, so /areas and an area page share one
 *      persisted preference).
 *   2. Optimistic date state. Bars render from `projects` patched with local
 *      overrides, so a date edit lands instantly and the override dissolves as
 *      soon as the refetched props agree with it.
 *   3. The undo path — one path for this popover AND for u4's drag.
 *
 * Every date and every pixel comes from `lib/projects/timeline`. There is no
 * date math in this file, and no re-derivation of geometry the engine already
 * computed (totalWidthPx, leftPx, widthPx, todayOffsetPx).
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { updateProject } from "@/app/actions/projects";
import type { TimelineDatePatch } from "@/components/projects/timeline/ProjectBarPopover";
import { TimelineGroup } from "@/components/projects/timeline/TimelineGroup";
import { TimelineHeader, TIMELINE_HEADER_HEIGHT_PX } from "@/components/projects/timeline/TimelineHeader";
import { TimelineZoomToggle } from "@/components/projects/timeline/TimelineZoomToggle";
import { useTimelineView } from "@/components/projects/timeline/useTimelineView";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import { todayISODate } from "@/lib/projects/archive-status";
import {
  columnsForWindow,
  computeWindow,
  groupByArea,
  headerGroupsForWindow,
  markCurrentColumn,
  todayOffsetPx,
  type TimelineAreaInput,
  type TimelineProjectInput,
  type TimelineRowProject,
} from "@/lib/projects/timeline";

interface Props {
  areas: TimelineAreaInput[];
  projects: TimelineProjectInput[];
  showArchived: boolean;
  scope: "all" | "area";
  /** Extra controls for the toolbar's right side (e.g. the show-archived chip). */
  toolbarSlot?: ReactNode;
}

type DateOverrides = Record<string, TimelineDatePatch>;

export function ProjectsTimeline({ areas, projects, showArchived, scope, toolbarSlot }: Props) {
  const { zoom, setZoom } = useTimelineView();
  const { show: showUndoToast } = useUndoToast();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<DateOverrides>({});

  // "Today" is read once per render rather than ticked: these are `date`
  // columns with no time component, so the only event that can move the marker
  // is midnight, and a re-render will pick it up.
  const todayISO = todayISODate();

  // An override is a bet that the server will agree. Once the refetched props
  // carry the same dates, the bet has settled — drop it, so a later change from
  // anywhere else (realtime, another tab, u4's drag) is not masked forever.
  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next: DateOverrides = { ...prev };
      for (const p of projects) {
        const o = next[p.id];
        if (o && o.startDate === (p.startDate ?? null) && o.endDate === (p.endDate ?? null)) {
          delete next[p.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projects]);

  const patchedProjects = useMemo(
    () => projects.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p)),
    [projects, overrides],
  );

  // groupByArea does the ghost flagging, the show-archived filtering, and the
  // (orderIndex, createdAt) sort with the sentinel area last — all of it.
  const groups = useMemo(
    () => groupByArea(areas, patchedProjects, { showArchived, todayISO }),
    [areas, patchedProjects, showArchived, todayISO],
  );

  // The window follows what is actually on screen: a ghost hidden behind the
  // show-archived toggle must not stretch the canvas to reach a bar nobody
  // can see.
  const visibleProjects = useMemo(() => groups.flatMap((g) => g.projects), [groups]);

  const timelineWindow = useMemo(
    () => computeWindow(visibleProjects, zoom, todayISO),
    [visibleProjects, zoom, todayISO],
  );

  const minorColumns = useMemo(
    // isCurrent is not stamped by columnsForWindow (u1 API DEVIATIONS #1) —
    // column geometry stays independent of the clock, so callers pipe through.
    () => markCurrentColumn(columnsForWindow(timelineWindow, zoom), todayISO),
    [timelineWindow, zoom, todayISO],
  );
  const majorGroups = useMemo(
    () => headerGroupsForWindow(timelineWindow, zoom),
    [timelineWindow, zoom],
  );

  const todayPx = todayOffsetPx(timelineWindow, todayISO);

  // Center today, with the CalendarGrid ResizeObserver fallback: on first paint
  // the scroller can still be 0-wide, and there is nothing to center inside.
  const scrollToToday = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || todayPx === null) return false;
    const width = el.clientWidth;
    if (width === 0) return false;
    el.scrollLeft = Math.max(0, todayPx - width / 2);
    return true;
  }, [todayPx]);

  useEffect(() => {
    if (scrollToToday()) return;
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (scrollToToday()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToToday]);

  const handleCommitDates = useCallback(
    (project: TimelineRowProject, patch: TimelineDatePatch) => {
      const previous: TimelineDatePatch = {
        startDate: project.startDate,
        endDate: project.endDate,
      };

      // Optimistic first, then the toast — the use-undo-toast contract is
      // deferred commit: the write fires when the toast closes, and Undo simply
      // means it never fires at all.
      setOverrides((prev) => ({ ...prev, [project.id]: patch }));

      showUndoToast({
        message: `Dates updated · ${project.name}`,
        optimisticRemove: () => {},
        commit: async () => {
          const result = await updateProject({ id: project.id, ...patch });
          if (!result.success) {
            setOverrides((prev) => ({ ...prev, [project.id]: previous }));
            toast.error(result.error ?? "Could not update dates");
          }
        },
        undo: () => {},
        addBack: () => {
          setOverrides((prev) => ({ ...prev, [project.id]: previous }));
        },
      });
    },
    [showUndoToast],
  );

  if (areas.length === 0) {
    return <TimelineEmpty title="No areas yet" hint="Create an area to start placing projects on the timeline." />;
  }

  if (visibleProjects.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <TimelineZoomToggle zoom={zoom} onZoomChange={setZoom} onToday={scrollToToday} todayDisabled />
          {toolbarSlot}
        </div>
        <TimelineEmpty
          title={showArchived ? "No projects yet" : "No active projects"}
          hint={
            showArchived
              ? "Projects appear here as soon as an area has one."
              : "Every project here has ended or been archived. Show archived to see them."
          }
        />
      </div>
    );
  }

  let rowIndexOffset = 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <TimelineZoomToggle
          zoom={zoom}
          onZoomChange={setZoom}
          onToday={scrollToToday}
          todayDisabled={todayPx === null}
        />
        {toolbarSlot}
      </div>

      <div className="sd-panel overflow-hidden">
        <div
          ref={scrollerRef}
          className="scrollbar-hidden timeline-edge-fade max-h-[calc(100vh-16rem)] overflow-auto"
          data-testid="timeline-scroller"
        >
          <div className="relative" style={{ width: timelineWindow.totalWidthPx }}>
            <TimelineHeader
              majorGroups={majorGroups}
              minorColumns={minorColumns}
              totalWidthPx={timelineWindow.totalWidthPx}
            />

            {/* Grid — 1px --sd-line per minor column (§21). Behind the lanes. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-0"
              style={{ top: TIMELINE_HEADER_HEIGHT_PX }}
            >
              {minorColumns.map((column) => (
                <span
                  key={column.startISO}
                  className="absolute top-0 bottom-0 w-px bg-[var(--sd-line)]"
                  style={{ left: column.leftPx }}
                />
              ))}
            </div>

            {groups.map((group) => {
              const offset = rowIndexOffset;
              rowIndexOffset += group.projects.length + 1;
              return (
                <TimelineGroup
                  key={group.area.id}
                  group={group}
                  timelineWindow={timelineWindow}
                  todayISO={todayISO}
                  totalWidthPx={timelineWindow.totalWidthPx}
                  showAreaHeader={scope === "all"}
                  openProjectId={openProjectId}
                  onSetOpen={setOpenProjectId}
                  onCommitDates={handleCommitDates}
                  rowIndexOffset={offset}
                />
              );
            })}

            {/* Today marker — 3px accent at 70%. No halo, no blur, no pulse. */}
            {todayPx !== null && (
              <span
                aria-hidden="true"
                data-testid="timeline-today-marker"
                className="pointer-events-none absolute bottom-0 z-[1] w-[3px] bg-[color-mix(in_oklch,var(--sd-accent)_70%,transparent)]"
                style={{ left: todayPx, top: TIMELINE_HEADER_HEIGHT_PX }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="sd-panel flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <p className="font-medium text-[14px] text-[var(--sd-ink)]">{title}</p>
      <p className="max-w-[42ch] text-[13px] text-[var(--sd-ink-dull)] leading-snug">{hint}</p>
    </div>
  );
}
