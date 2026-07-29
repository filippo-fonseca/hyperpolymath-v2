"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { AreaCardMenu } from "@/components/areas/AreaCardMenu";
import { AreasPageHeader } from "@/components/areas/AreasPageHeader";
import { AreasTree } from "@/components/areas/AreasTree";
import { ProjectsTimeline } from "@/components/projects/timeline/ProjectsTimeline";
import { useTimelineView } from "@/components/projects/timeline/useTimelineView";
import { PageScaffold } from "@/components/ui/PageScaffold";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
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

  // Edits and deletes from the per-area menu settle here rather than through
  // router.refresh(). The whole route tree, layout queries included, used to
  // re-run so one row could change its label. The sidebar is unaffected: it
  // reconciles independently off the Realtime echo on ['areas', userId].
  function handleAreaUpdated(
    id: string,
    patch: { name: string; emoji: string | null },
  ) {
    setAreas((prev) =>
      prev.map((area) => (area.id === id ? { ...area, ...patch } : area)),
    );
  }

  function handleAreaDeleted(id: string) {
    setAreas((prev) => prev.filter((area) => area.id !== id));
  }

  const isSentinel = (a: { name: string; emoji: string | null }) =>
    a.name === "No Area" && a.emoji === null;

  return (
    <PageScaffold
      title="Areas"
      subtitle={'"Energy is the currency of productivity." (Ali Abdaal)'}
      actions={
        <>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-1">
            {VIEW_SEGMENTS.map((seg) => (
              <button
                key={seg.value}
                type="button"
                onClick={() => setView(seg.value)}
                aria-pressed={view === seg.value}
                className={cn(
                  "cursor-pointer-always rounded px-2 py-1 text-meta",
                  "transition-colors duration-[160ms] ease-out",
                  view === seg.value
                    ? "bg-[var(--surface-raised)] font-medium text-[var(--ink)] shadow-[var(--shadow-card)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
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
        </>
      }
    >
      <PageScaffold.Section>
        {view === "tree" ? (
          <AreasTree
            areas={areas}
            rootAvatarUrl={rootAvatarUrl}
            rootInitial={rootInitial}
            rootLabel={rootLabel}
          />
        ) : isPending ? (
          <div className="sd-panel flex items-center justify-center px-6 py-14">
            <span className="text-meta text-[var(--ink-muted)]">Loading timeline…</span>
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
                  "inline-flex h-8 items-center gap-2 rounded-lg border px-2 text-meta font-medium",
                  "cursor-pointer-always transition-colors duration-[160ms] ease-out",
                  showArchived
                    ? "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink)]"
                    : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
              >
                Show archived
              </button>
            }
          />
        )}
      </PageScaffold.Section>

      {areas.length > 0 && (
        <PageScaffold.Section
          title="Manage areas"
          divided
          action={
            <span className="text-meta tabular-nums text-[var(--ink-muted)]">{areas.length}</span>
          }
        >
          <ul className="craft-card flex flex-col divide-y divide-[var(--edge)] rounded-xl px-4">
            {areas.map((area) => (
              <li
                key={area.id}
                className={cn("group/area-row flex items-center gap-3 px-1 py-3", tintFor(area.id))}
              >
                {area.emoji ? (
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-bg)] text-sm leading-none"
                    aria-hidden="true"
                  >
                    {area.emoji}
                  </span>
                ) : (
                  <span className="w-7 shrink-0" aria-hidden="true" />
                )}
                <span className="flex-1 text-body leading-snug text-[var(--ink)]">
                  {area.name}
                  {isSentinel(area) && (
                    <span className="ml-2 text-micro text-[var(--ink-faint)]">
                      (auto-created bucket)
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-meta tabular-nums text-[var(--ink-muted)]">
                  {area.projects.length} project
                  {area.projects.length === 1 ? "" : "s"}
                </span>
                <AreaCardMenu
                  areaId={area.id}
                  areaName={area.name}
                  areaEmoji={area.emoji}
                  onUpdated={handleAreaUpdated}
                  onDeleted={handleAreaDeleted}
                />
              </li>
            ))}
          </ul>
        </PageScaffold.Section>
      )}
    </PageScaffold>
  );
}
