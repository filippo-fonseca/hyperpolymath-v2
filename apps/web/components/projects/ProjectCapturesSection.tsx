"use client";

import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { CaptureCard } from "@/components/captures/CaptureCard";
import { CaptureComposer } from "@/components/captures/CaptureComposer";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-captures-body"
          className="group flex items-center gap-2 -ml-1 px-1 py-1 rounded-sm hover:bg-[var(--surface)] transition-colors cursor-pointer"
        >
          <span className="text-[var(--sd-ink-dull)] group-hover:text-[var(--sd-ink)] transition-colors">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sd-ink-dull)] group-hover:text-[var(--sd-ink)] transition-colors">
            Captures
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-[var(--sd-ink-dull)]">
            ({projectCaptures.length})
          </span>
        </button>
        {!collapsed && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
            ⌘↵ to capture
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
              <EmptyCaptures />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {projectCaptures.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
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
    </section>
  );
}

function EmptyCaptures() {
  return (
    <div className="rounded-md border border-dashed border-[var(--edge)] px-5 py-6 text-center">
      <p className="font-sans italic text-[15px] text-[var(--sd-ink-dull)]">
        Nothing captured here yet.
      </p>
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]/70 mt-1.5">
        Type a thought above — ⌘↵ to file it.
      </p>
    </div>
  );
}
