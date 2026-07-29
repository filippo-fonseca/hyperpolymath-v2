"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getProjectsForCurrentUser, type ProjectRow } from "@/app/actions/projects";
import { AreaProjectCardMenu } from "@/components/areas/AreaProjectCardMenu";
import { useAreaDetailView } from "@/components/areas/useAreaDetailView";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { ProjectsTimeline } from "@/components/projects/timeline/ProjectsTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/lifeos/entity-card";
import {
  type SemesterTerm,
  isProjectExpired,
  todayISODate,
} from "@/lib/projects/archive-status";
import type { TimelineAreaInput, TimelineProjectInput } from "@/lib/projects/timeline";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";

export interface AreaProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  description: string | null;
  // startDate / createdAt / orderIndex are carried for the timeline view (u5);
  // the register does not read them.
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
  /** Opens the New project dialog owned by AreaDetailClient (empty-state CTA). */
  onNewProject?: () => void;
}

const TODAY = todayISODate();

/**
 * Archived, or its run has ended; either way it's no longer "live". A class
 * ends with its semester; everything else ends with its end date (issue #55).
 */
function isPast(p: AreaProject): boolean {
  if (p.archivedAt) return true;
  return isProjectExpired(p, TODAY);
}

/**
 * The area's projects as an AturnDeck-style register: generous full-width
 * rows, plain-text meta separated by a faint middle dot, one quiet StatusPill
 * per row, hover moving only the border. Three behaviors layer on top:
 *  - Active / Archived tabs; archived or past-end-date projects move out of
 *    the live view into their own tab instead of vanishing.
 *  - "Hide classes" toggle so non-class work can be isolated.
 *  - Grid | Timeline view switch (the timeline is U9-owned and reused as-is).
 */
export function AreaProjectList({
  areaId,
  area,
  userId,
  projects: initialProjects,
  allAreas,
  onNewProject,
}: Props) {
  // The register renders from the server props, so a rename or a delete from a
  // row menu used to settle by refetching the whole route. Holding the list as
  // state (re-seeded whenever the server sends a new one, exactly as the areas
  // index does) lets those mutations settle in place instead.
  const [projects, setProjects] = useState(initialProjects);
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  function handleProjectUpdated(id: string, patch: Partial<AreaProject>) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  /** Delete and move-to-another-area both remove the row from this area. */
  function handleProjectRemoved(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [hideClasses, setHideClasses] = useState(false);
  const { view, setView } = useAreaDetailView();

  const timelineActive = view === "timeline";

  // Live projects for the timeline. getProjectsForCurrentUser is the only read
  // path carrying start_date, and, keyed on the shared ["projects", userId],
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

  const timelineAreas = useMemo<TimelineAreaInput[]>(() => [areaToTimelineInput(area)], [area]);
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
      <EmptyState
        size="section"
        title="No projects in this area yet"
        description="Projects group this area's tasks, captures, and pages into bodies of work."
        action={onNewProject ? { label: "New project", onClick: onNewProject } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab + filter row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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
          {/* hideClasses filters the register only; the timeline has no class filter. */}
          {view === "grid" && tab === "active" && activeHasClasses ? (
            <button
              type="button"
              onClick={() => setHideClasses((v) => !v)}
              aria-pressed={hideClasses}
              className={cn(
                "h-8 rounded-lg px-3 text-meta cursor-pointer-always",
                "transition-colors duration-[160ms] ease-out",
                hideClasses
                  ? "bg-[var(--selected)] text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
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
        <EmptyState
          size="section"
          title={
            tab === "archived"
              ? "Nothing archived or past its end date"
              : hideClasses
                ? "No non-class projects here"
                : "No active projects"
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((p) => {
            const status = statusFor(p);
            const meta = [
              p.isClass && p.courseCode ? p.courseCode : null,
              p.description,
            ].filter(Boolean) as string[];
            return (
              <li key={p.id} className={cn("group relative", tintFor(p.id))}>
                <Link
                  href={`/projects/${p.id}`}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] px-5 py-4",
                    "shadow-[var(--shadow-card)]",
                    "transition-[border-color,box-shadow] duration-[160ms] ease-out cursor-pointer-always",
                    "hover:border-[color-mix(in_srgb,var(--tint-edge)_45%,var(--edge))] hover:shadow-[var(--shadow-card-hover)]",
                    isPast(p) && "opacity-70"
                  )}
                >
                  {/* Icon on the project's deterministic pastel plate. */}
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-bg)] text-[var(--tint-ink)]"
                  >
                    <DynamicIcon name={p.icon} size={18} strokeWidth={1.5} className="shrink-0" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-subtitle font-medium leading-snug text-[var(--ink)]">
                      {p.name}
                    </span>
                    {meta.length > 0 ? (
                      <span className="truncate text-meta text-[var(--ink-muted)]">
                        {meta.map((m, i) => (
                          // Positional meta fragments; the index is the identity.
                          // biome-ignore lint/suspicious/noArrayIndexKey: positional by design
                          <span key={i}>
                            {i > 0 ? (
                              <span aria-hidden className="mx-2 text-[var(--ink-faint)]">
                                ·
                              </span>
                            ) : null}
                            {m}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  {status ? <StatusPill tone="idle" label={status} /> : null}
                  {/* Spacer keeps the pill clear of the absolutely-placed row menu. */}
                  <span className="w-6 shrink-0" aria-hidden />
                </Link>
                <div className="absolute top-1/2 right-4 z-10 -translate-y-1/2">
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
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One quiet pill per row (never chip-on-chip): lifecycle first, then kind.
 * Archived and Ended outrank Class because the course code in the meta line
 * already marks a class.
 */
function statusFor(p: AreaProject): string | null {
  if (p.archivedAt) return "Archived";
  if (isPast(p)) return "Ended";
  if (p.isClass) return "Class";
  return null;
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
        "h-8 rounded-lg px-3 text-meta cursor-pointer-always",
        "transition-colors duration-[160ms] ease-out",
        active
          ? "bg-[var(--selected)] font-medium text-[var(--ink)]"
          : "text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
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
 * Grid | Timeline segmented control. Same grammar as the /areas index
 * Tree | Timeline toggle (AreasPageClient) so the two surfaces read as one
 * system: 8px shell, 4px segments, sentence case, ladder radii only.
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
      className="flex items-center gap-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-1"
    >
      {VIEW_SEGMENTS.map((seg) => (
        <button
          key={seg.value}
          type="button"
          onClick={() => onChange(seg.value)}
          aria-pressed={view === seg.value}
          className={cn(
            "cursor-pointer-always rounded px-2 py-1 text-meta",
            "transition-colors duration-[160ms] ease-out",
            view === seg.value
              ? "bg-[var(--selected)] font-medium text-[var(--ink)]"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
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
