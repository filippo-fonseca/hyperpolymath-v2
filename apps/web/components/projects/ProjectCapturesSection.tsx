"use client";

import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { CaptureCard } from "@/components/captures/CaptureCard";
import { CaptureComposer } from "@/components/captures/CaptureComposer";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, useTransition } from "react";

interface Props {
  userId: string;
  projectId: string;
  hashtags: { id: string; name: string; displayName: string }[];
  projects: ProjectMultiSelectOption[];
  /** SSR-hydrated capture slice for this project. */
  initialCaptures: CaptureWithLinks[];
}

/**
 * Project-scoped capture surface. Same data model as /captures, just filtered
 * to captures linked to THIS project. Composer is pre-tagged so a quick-fire
 * note from the project page stays linked here without manual selection.
 *
 * Like ProjectTasksSection, we read from the canonical
 * `["captures", userId]` key — derived per-project locally — so a realtime
 * echo from any surface lands here for free.
 */
export function ProjectCapturesSection({
  userId,
  projectId,
  hashtags,
  projects,
  initialCaptures,
}: Props) {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(localStorage.getItem("project-captures-collapsed") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("project-captures-collapsed", String(collapsed));
  }, [collapsed]);

  useTableSubscription("captures", userId);
  useTableSubscription("captures_projects", userId, {
    alsoInvalidate: [tableKey("captures", userId)],
  });
  useTableSubscription("captures_hashtags", userId, {
    alsoInvalidate: [tableKey("captures", userId)],
  });

  const { data: allCaptures = [] } = useQuery({
    queryKey: tableKey("captures", userId),
    queryFn: () => getCapturesForCurrentUser(),
    // Seed with the project slice so first paint matches the URL. Refetch
    // populates the full set.
    initialData: initialCaptures,
  });

  // RT-06 self-reconciling overlay — pending insert/delete persist until the
  // canonical captures cache catches up, so a project capture can't flash out
  // and back in under a slow refetch / Realtime echo.
  const [optimisticCaptures, addOptimistic] = useOptimisticList<CaptureWithLinks>(allCaptures);

  const projectCaptures = useMemo(
    () => optimisticCaptures.filter((c) => c.projects.some((p) => p.id === projectId)),
    [optimisticCaptures, projectId]
  );

  function handleOptimisticInsert(row: CaptureWithLinks) {
    // React 19: `useOptimistic` dispatches MUST sit inside a transition or an
    // action. CaptureComposer fires `onOptimisticInsert` outside its own
    // `startTransition` (it dispatches BEFORE wrapping the server call), so
    // we wrap here. Without this, React 19.2 logs:
    //   "An optimistic state update occurred outside a transition or action."
    startTransition(() => {
      addOptimistic({ type: "insert", row });
    });
    // Belt-and-suspenders refetch after the server settles — same guarantee
    // we apply to task creation. Without this a slow realtime echo could
    // revert the optimistic row before the canonical record lands.
    void queryClient.invalidateQueries({
      queryKey: tableKey("captures", userId),
    });
  }

  return (
    // Rendered inside a <PageScaffold.Section>, which owns the section rhythm
    // and the landmark element; this root is layout only.
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-captures-body"
          className="group flex items-center gap-2 -ml-1 rounded-lg px-1 py-1 hover:bg-[var(--hover)] transition-colors duration-[160ms] ease-out cursor-pointer"
        >
          <span className="text-[var(--ink-faint)] group-hover:text-[var(--ink-muted)] transition-colors duration-[160ms]">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
          <h2 className="text-title font-semibold text-[var(--ink)]">Captures</h2>
          <span className="text-micro font-medium tabular-nums text-[var(--ink-faint)]">
            {projectCaptures.length}
          </span>
        </button>
        {!collapsed && (
          <span className="text-micro text-[var(--ink-faint)]">
            <kbd className="font-mono">⌘↵</kbd> to capture
          </span>
        )}
      </div>

      {!collapsed && (
        <div id="project-captures-body" className="flex flex-col gap-4">
          {/* Composer pre-linked to this project. Submitting keeps the link
              so the user can fire off multiple quick captures without
              re-selecting. */}
          <CaptureComposer
            userId={userId}
            hashtags={hashtags}
            projects={projects}
            defaultProjectIds={[projectId]}
            onOptimisticInsert={handleOptimisticInsert}
            onOptimisticRevert={(id) => addOptimistic({ type: "revert", id })}
          />

          {/* Feed — vertical stack, document register, FLIP-free entry/exit. */}
          <div className="flex flex-col gap-2">
            {projectCaptures.length === 0 ? (
              // Quiet inline register: the composer directly above is already
              // the call to action, so the empty state only names the absence.
              <EmptyState size="inline" title="Nothing captured here yet" />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {projectCaptures.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      reduceMotion
                        ? { opacity: 0, transition: { duration: 0 } }
                        : { opacity: 0, y: 4, transition: { duration: 0.22 } }
                    }
                    transition={
                      reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 1, 0.5, 1] }
                    }
                  >
                    <CaptureCard
                      capture={c}
                      compact
                      onOptimisticDelete={(id) =>
                        startTransition(() => addOptimistic({ type: "delete", id }))
                      }
                      onOptimisticRevert={(id) => addOptimistic({ type: "revert", id })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
