"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { AreaCardMenu } from "@/components/areas/AreaCardMenu";
import { AreasPageHeader } from "@/components/areas/AreasPageHeader";
import { AreasTree } from "@/components/areas/AreasTree";
import { ProjectsTimeline } from "@/components/projects/timeline/ProjectsTimeline";
import { useTimelineView } from "@/components/projects/timeline/useTimelineView";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";

/**
 * The tree's own show-archived preference. The timeline deliberately shares the
 * key rather than minting a second one: "show archived" is one intent about
 * this page, and having it mean two different things depending on which view
 * you happen to be in would be a bug, not a feature.
 */
const SHOW_ARCHIVED_KEY = "areas-tree-show-archived";

const VIEW_SEGMENTS: { value: "tree" | "timeline"; label: string }[] = [
  { value: "tree", label: "Tree" },
  { value: "timeline", label: "Timeline" },
];

interface Props {
  initialAreas: SidebarArea[];
  userId: string;
  rootAvatarUrl: string | null;
  rootInitial: string;
  rootLabel: string;
}

export function AreasPageClient({
  initialAreas,
  userId,
  rootAvatarUrl,
  rootInitial,
  rootLabel,
}: Props) {
  const [areas, setAreas] = useState(initialAreas);
  const { view, setView } = useTimelineView();
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setAreas(initialAreas);
  }, [initialAreas]);

  useEffect(() => {
    try {
      setShowArchived(localStorage.getItem(SHOW_ARCHIVED_KEY) === "true");
    } catch {
      /* localStorage unavailable — stay hiding archived. */
    }
  }, []);

  const toggleShowArchived = useCallback(() => {
    setShowArchived((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_ARCHIVED_KEY, String(next));
      } catch {
        /* Persistence is best-effort. */
      }
      return next;
    });
  }, []);

  // getProjectsForCurrentUser is the only read path carrying start_date. Its
  // semantics are left exactly as they are — ProjectDetailClient depends on
  // them — so ordering and the archived filter happen client-side, inside the
  // engine's groupByArea.
  const timelineActive = view === "timeline";
  const { data: projectRows, isPending } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: getProjectsForCurrentUser,
    enabled: timelineActive,
  });

  // Date edits from the timeline move a project between active and archived, so
  // the sidebar tree (which lives under the areas key) has to hear about it too.
  useTableSubscription("projects", userId, {
    enabled: timelineActive,
    alsoInvalidate: [tableKey("areas", userId)],
  });

  function handleCreated(area: SidebarArea) {
    setAreas((prev) => (prev.some((a) => a.id === area.id) ? prev : [...prev, area]));
  }

  function handleCreateFailed(id: string) {
    setAreas((prev) => prev.filter((area) => area.id !== id));
  }

  const isSentinel = (a: { name: string; emoji: string | null }) =>
    a.name === "No Area" && a.emoji === null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Breadcrumbs items={[{ label: "Areas" }]} />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] p-0.5">
            {VIEW_SEGMENTS.map((seg) => (
              <button
                key={seg.value}
                type="button"
                onClick={() => setView(seg.value)}
                aria-pressed={view === seg.value}
                className={cn(
                  "cursor-pointer-always rounded-[5px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]",
                  "transition-colors duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
                  view === seg.value
                    ? "bg-[var(--sd-selected)] text-[var(--sd-ink)] ring-1 ring-inset ring-[var(--sd-line)]"
                    : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
                )}
              >
                {seg.label}
              </button>
            ))}
          </div>
          <AreasPageHeader
            userId={userId}
            currentAreaCount={areas.length}
            onCreated={handleCreated}
            onCreateFailed={handleCreateFailed}
          />
        </div>
      </div>

      <header className="mb-4 text-center space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Areas
        </h1>
        <p className="text-[14px] text-[var(--ink-muted)]">
          "Energy is the currency of productivity." — Ali Abdaal
        </p>
      </header>

      {view === "tree" ? (
        <AreasTree
          areas={areas}
          rootAvatarUrl={rootAvatarUrl}
          rootInitial={rootInitial}
          rootLabel={rootLabel}
        />
      ) : isPending ? (
        <div className="sd-panel flex items-center justify-center px-6 py-14">
          <span className="font-mono text-[11px] text-[var(--sd-ink-faint)] uppercase tracking-[0.08em]">
            Loading timeline…
          </span>
        </div>
      ) : (
        <ProjectsTimeline
          areas={areas}
          projects={projectRows ?? []}
          showArchived={showArchived}
          scope="all"
          toolbarSlot={
            <button
              type="button"
              onClick={toggleShowArchived}
              aria-pressed={showArchived}
              title="Archived and ended projects render as muted ghost bars"
              className={cn(
                "inline-flex h-[26px] items-center gap-1.5 rounded-[8px] border px-2 text-[12px] font-medium",
                "cursor-pointer-always transition-colors duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
                showArchived
                  ? "border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-ink)]"
                  : "border-transparent text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
              )}
            >
              Show archived
            </button>
          }
        />
      )}

      {areas.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Manage areas
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
              ({areas.length})
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--edge)]">
            {areas.map((area) => (
              <li key={area.id} className="group/area-row flex items-center gap-3 py-2.5 px-1">
                {area.emoji ? (
                  <span className="text-base leading-none shrink-0" aria-hidden="true">
                    {area.emoji}
                  </span>
                ) : (
                  <span className="w-5 shrink-0" aria-hidden="true" />
                )}
                <span className="text-[15px] text-[var(--ink)] flex-1 leading-snug">
                  {area.name}
                  {isSentinel(area) && (
                    <em className="font-mono text-[10px] not-italic text-[var(--ink-muted)] ml-2 tracking-[0.06em]">
                      (auto-created bucket)
                    </em>
                  )}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)] shrink-0">
                  {area.projects.length} project
                  {area.projects.length === 1 ? "" : "s"}
                </span>
                <AreaCardMenu areaId={area.id} areaName={area.name} areaEmoji={area.emoji} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
