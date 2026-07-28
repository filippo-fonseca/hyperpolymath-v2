"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getProjectsForCurrentUser, type ProjectRow } from "@/app/actions/projects";
import { AreaProjectCardMenu } from "@/components/areas/AreaProjectCardMenu";
import { useAreaDetailView } from "@/components/areas/useAreaDetailView";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { ProjectsTimeline } from "@/components/projects/timeline/ProjectsTimeline";
import {
  type SemesterTerm,
  isProjectExpired,
  todayISODate,
} from "@/lib/projects/archive-status";
import type { TimelineAreaInput, TimelineProjectInput } from "@/lib/projects/timeline";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";

export interface AreaProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  description: string | null;
  // startDate / createdAt / orderIndex are carried for the timeline view (u5);
  // the grid does not read them.
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | Date | null;
  semesterTerm: SemesterTerm | null;
  semesterYear: number | null;
  orderIndex: number;
  createdAt: string | Date;
}

/** The single area this page renders, enough to satisfy TimelineAreaInput. */
export interface AreaDetailArea {
  id: string;
  name: string;
  emoji: string | null;
  orderIndex: number;
  createdAt: string | Date;
}

interface Props {
  areaId: string;
  area: AreaDetailArea;
  userId: string;
  projects: AreaProject[];
  allAreas: { id: string; name: string }[];
}

const TODAY = todayISODate();

/**
 * Archived, or its run has ended — either way it's no longer "live". A class
 * ends with its semester; everything else ends with its end date (issue #55).
 */
function isPast(p: AreaProject): boolean {
  if (p.archivedAt) return true;
  return isProjectExpired(p, TODAY);
}

/**
 * Area project list with three behaviors layered on the simple grid:
 *  - CLASS badge on class projects.
 *  - "Hide classes" toggle so non-class work can be isolated (Yale-style areas
 *    that mix classes with standalone projects).
 *  - Active / Archived tabs — archived or past-end-date projects move out of the
 *    live view into their own tab instead of vanishing.
 */
export function AreaProjectList({
  areaId,
  area,
  userId,
  projects: initialProjects,
  allAreas,
}: Props) {
  // The grid renders from the server props, so a rename or a delete from a
  // card menu used to settle by refetching the whole route. Holding the list
  // as state (re-seeded whenever the server sends a new one, exactly as the
  // areas index does) lets those mutations settle in place instead.
  const [projects, setProjects] = useState(initialProjects);
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  function handleProjectUpdated(id: string, patch: Partial<AreaProject>) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  /** Delete and move-to-another-area both remove the card from this area. */
  function handleProjectRemoved(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [hideClasses, setHideClasses] = useState(false);
  const { view, setView } = useAreaDetailView();

  const timelineActive = view === "timeline";

  // Live projects for the timeline. getProjectsForCurrentUser is the only read
  // path carrying start_date, and — keyed on the shared ["projects", userId] —
  // the realtime subscription's own invalidation refetches it, so external date
  // changes refresh the bars. Until it resolves the widened RSC props render the
  // timeline instantly (no loading flash). Semantics of that action are left
  // untouched; this area's rows are filtered out client-side.
  const { data: liveRows } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: getProjectsForCurrentUser,
    enabled: timelineActive,
  });

  // Date edits from the timeline move a project between active and archived, so
  // the sidebar tree (under the areas key) must hear about it too. Mirrors the
  // /areas index wiring exactly.
  useTableSubscription("projects", userId, {
    enabled: timelineActive,
    alsoInvalidate: [tableKey("areas", userId)],
  });

  const { active, archived } = useMemo(() => {
    const active: AreaProject[] = [];
    const archived: AreaProject[] = [];
    for (const p of projects) (isPast(p) ? archived : active).push(p);
    return { active, archived };
  }, [projects]);

  const activeHasClasses = active.some((p) => p.isClass);
  const baseList = tab === "active" ? active : archived;
  const list = tab === "active" && hideClasses ? baseList.filter((p) => !p.isClass) : baseList;

  const timelineAreas = useMemo<TimelineAreaInput[]>(
    () => [areaToTimelineInput(area)],
    [area],
  );
  const timelineProjects = useMemo<TimelineProjectInput[]>(() => {
    if (liveRows) {
      return liveRows.filter((r) => r.areaId === areaId).map(projectRowToTimeline);
    }
    return projects.map((p) => areaProjectToTimeline(p, areaId));
  }, [liveRows, projects, areaId]);

  // One control governs archived visibility across BOTH views: the Active /
  // Archived tab. Active → active bars only; Archived → ghosts surface.
  const showArchived = tab === "archived";

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <ViewToggle view={view} onChange={setView} />
        </div>
        {timelineActive ? (
          <ProjectsTimeline
            areas={timelineAreas}
            projects={timelineProjects}
            showArchived={showArchived}
            scope="area"
          />
        ) : (
          <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-10 text-center">
            <p className="text-base text-[var(--ink-muted)]">
              No projects in this area yet.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]/70 mt-2">
              Use the New project button above to get started.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab + filter row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <TabButton
            label="Active"
            count={active.length}
            active={tab === "active"}
            onClick={() => setTab("active")}
          />
          <TabButton
            label="Archived"
            count={archived.length}
            active={tab === "archived"}
            onClick={() => setTab("archived")}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* hideClasses filters the grid only — the timeline has no class filter. */}
          {view === "grid" && tab === "active" && activeHasClasses ? (
            <button
              type="button"
              onClick={() => setHideClasses((v) => !v)}
              aria-pressed={hideClasses}
              className={cn(
                "px-2.5 py-1 rounded-sm font-mono text-[11px] uppercase tracking-[0.08em] cursor-pointer-always",
                "border transition-colors duration-150 ease-out",
                hideClasses
                  ? "border-[var(--edge-hud)] bg-[var(--surface-raised)] text-[var(--ink)]"
                  : "border-[var(--edge)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]"
              )}
            >
              {hideClasses ? "Show classes" : "Hide classes"}
            </button>
          ) : null}
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {timelineActive ? (
        <ProjectsTimeline
          areas={timelineAreas}
          projects={timelineProjects}
          showArchived={showArchived}
          scope="area"
        />
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-8 text-center">
          <p className="text-base text-[var(--ink-muted)]">
            {tab === "archived"
              ? "Nothing archived or past its end date."
              : hideClasses
                ? "No non-class projects here."
                : "No active projects."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 @sm/main:grid-cols-2 @2xl/main:grid-cols-3 gap-4">
          {list.map((p) => (
            <li key={p.id} className="relative group">
              <Link
                href={`/projects/${p.id}`}
                className={cn(
                  "group flex flex-col gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface)] px-4 py-4 h-full",
                  "hover:border-[var(--edge-hud)] hover:bg-[var(--surface-raised)] transition-colors duration-150 ease-out cursor-pointer-always",
                  isPast(p) && "opacity-70"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <DynamicIcon
                    name={p.icon}
                    size={18}
                    strokeWidth={1.5}
                    className="text-[var(--ink-muted)] shrink-0 mt-0.5 group-hover:text-[var(--ink)] transition-colors"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg font-semibold text-[var(--ink)] leading-tight truncate">
                        {p.name}
                      </span>
                      {p.isClass ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)] border border-[var(--edge)] bg-[var(--surface-raised)]">
                          Class
                        </span>
                      ) : null}
                      {p.archivedAt ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)] border border-[var(--edge)]">
                          Archived
                        </span>
                      ) : isPast(p) ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)] border border-[var(--edge)]">
                          Ended
                        </span>
                      ) : null}
                    </div>
                    {p.isClass && p.courseCode ? (
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                        {p.courseCode}
                      </span>
                    ) : null}
                  </div>
                </div>
                {p.description ? (
                  <p className="text-sm text-[var(--ink-muted)] line-clamp-2">
                    {p.description}
                  </p>
                ) : null}
              </Link>
              <div className="absolute top-2 right-2 z-10">
                <AreaProjectCardMenu
                  projectId={p.id}
                  projectName={p.name}
                  projectDescription={p.description}
                  projectIcon={p.icon}
                  isClass={p.isClass}
                  currentAreaId={areaId}
                  allAreas={allAreas}
                  onUpdated={handleProjectUpdated}
                  onRemoved={handleProjectRemoved}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-sm font-mono text-[11px] font-semibold uppercase tracking-[0.12em] cursor-pointer-always",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--surface-raised)] text-[var(--ink)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      )}
    >
      {label} <span className="tabular-nums text-[var(--ink-muted)]">({count})</span>
    </button>
  );
}

const VIEW_SEGMENTS: { value: "grid" | "timeline"; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "timeline", label: "Timeline" },
];

/**
 * Grid|Timeline segmented control. Same grammar as the /areas index
 * TREE|TIMELINE toggle (AreasPageClient) so the two surfaces read as one system.
 */
function ViewToggle({
  view,
  onChange,
}: {
  view: "grid" | "timeline";
  onChange: (next: "grid" | "timeline") => void;
}) {
  return (
    <div
      data-testid="area-detail-view-toggle"
      className="flex items-center gap-0.5 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] p-0.5"
    >
      {VIEW_SEGMENTS.map((seg) => (
        <button
          key={seg.value}
          type="button"
          onClick={() => onChange(seg.value)}
          aria-pressed={view === seg.value}
          className={cn(
            "cursor-pointer-always rounded-[5px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]",
            "transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
            view === seg.value
              ? "bg-[var(--sd-selected)] text-[var(--sd-ink)] ring-1 ring-inset ring-[var(--sd-line)]"
              : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]"
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}

// --- Mappers: page shapes → the timeline engine's inputs -------------------

function areaToTimelineInput(area: AreaDetailArea): TimelineAreaInput {
  return {
    id: area.id,
    name: area.name,
    emoji: area.emoji,
    orderIndex: area.orderIndex,
    createdAt: area.createdAt,
  };
}

/** Widened RSC props → TimelineProjectInput (this area's projects, pre-filtered). */
function areaProjectToTimeline(p: AreaProject, areaId: string): TimelineProjectInput {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    areaId,
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: p.createdAt,
    archivedAt: p.archivedAt,
    isClass: p.isClass,
    semesterTerm: p.semesterTerm,
    semesterYear: p.semesterYear,
    orderIndex: p.orderIndex,
  };
}

/** Live query rows → TimelineProjectInput. */
function projectRowToTimeline(r: ProjectRow): TimelineProjectInput {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    areaId: r.areaId,
    startDate: r.startDate,
    endDate: r.endDate,
    createdAt: r.createdAt,
    archivedAt: r.archivedAt,
    isClass: r.isClass,
    semesterTerm: r.semesterTerm,
    semesterYear: r.semesterYear,
    orderIndex: r.orderIndex,
  };
}
