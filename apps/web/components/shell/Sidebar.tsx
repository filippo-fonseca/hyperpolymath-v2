"use client";

import { useEffect, useOptimistic, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { PersistentNav } from "./PersistentNav";
import { SidebarTree } from "./SidebarTree";
import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import { getAreasForCurrentUser } from "@/app/actions/areas";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  userId: string;
  initialActiveAreas: SidebarArea[];
  initialAllAreas: SidebarArea[];
  graduationYear?: number | null;
}

export type AreaOptimisticDispatch = (
  action: OptimisticAction<SidebarArea>,
) => void;

/**
 * Sidebar — M3 owner of the areas useOptimistic state.
 *
 * AreaCreateDialog and SidebarTree are SIBLINGS of this component. Both consume
 * (and SidebarTree, via context menu, also mutates) the same `areas` list.
 * Per the plan's M3 decision, we lift `useQuery` + `useOptimistic` here and
 * pass `addOptimisticArea` down to both — no React context needed for the
 * direct-child fan-out.
 *
 * Realtime subscriptions for both `areas` and `projects` live here too —
 * SidebarTree mutates projects (drag reorder, context-menu rename/archive),
 * so subscribing at the shared parent guarantees one channel per (table, userId)
 * regardless of how many sub-rows mount.
 */
export function Sidebar({
  userId,
  initialActiveAreas,
  initialAllAreas,
  graduationYear,
}: Props) {
  // Hydration safety (Pitfall 16): Read localStorage inside useEffect, NOT during render.
  const [collapsed, setCollapsed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedCollapsed = localStorage.getItem("sidebar-collapsed");
    const storedShowArchived = localStorage.getItem("sidebar-show-archived");
    if (storedCollapsed === "true") setCollapsed(true);
    if (storedShowArchived === "true") setShowArchived(true);
    setMounted(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function toggleShowArchived() {
    const next = !showArchived;
    setShowArchived(next);
    localStorage.setItem("sidebar-show-archived", String(next));
  }

  // Singleton channels for both tables — sidebar is the canonical mount point.
  // SidebarTree children also mount these (refcounted), keeping the count at 1
  // per (table, userId) regardless of UI re-renders.
  useTableSubscription("areas", userId);
  useTableSubscription("projects", userId);

  // Active-areas list is the canonical optimistic source (the hot path —
  // create, rename, reorder all happen here). When `showArchived` is toggled,
  // we display from `initialAllAreas` (not optimized; rare path).
  const { data: activeAreas = initialActiveAreas } = useQuery({
    queryKey: tableKey("areas", userId),
    queryFn: getAreasForCurrentUser,
    initialData: initialActiveAreas,
    // Phase 5.1 D-P2 #1 / JARVIS-21: treat the SSR-provided initialData as
    // fresh at mount time. Without this, TanStack 5 treats initialData as
    // updatedAt=0 (instantly stale) — any invalidateQueries call on this key
    // (e.g. from a JARVIS Server Action) triggers an immediate background
    // refetch even though the data hasn't changed. Realtime (useTableSubscription
    // above) remains the legitimate update path for actual areas table changes.
    initialDataUpdatedAt: Date.now(),
    staleTime: Infinity,
  });

  const [optimisticAreas, addOptimisticArea] = useOptimistic(
    activeAreas,
    optimisticReducer<SidebarArea>,
  );

  const areas = showArchived ? initialAllAreas : optimisticAreas;

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border shrink-0 overflow-hidden",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-[260px]",
        // Prevent layout shift before mounted (localStorage read)
        !mounted && "invisible",
      )}
      aria-label="Sidebar"
    >
      {/* Header: Wordmark + collapse toggle */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <Wordmark collapsed={collapsed} />
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {collapsed ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronLeft size={14} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {/* Persistent nav */}
        <PersistentNav collapsed={collapsed} />

        {/* Areas section */}
        <div className="mt-4">
          {!collapsed && (
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-[11px] font-sans uppercase tracking-widest text-muted-foreground select-none">
                Areas
              </span>
              <AreaCreateDialog
                userId={userId}
                addOptimisticArea={addOptimisticArea}
                currentAreaCount={activeAreas.length}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="New Area"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Plus size={12} />
                </Button>
              </AreaCreateDialog>
            </div>
          )}

          {collapsed && (
            <div className="flex justify-center py-1">
              <AreaCreateDialog
                userId={userId}
                addOptimisticArea={addOptimisticArea}
                currentAreaCount={activeAreas.length}
              >
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="New Area"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Plus size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">New Area</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </AreaCreateDialog>
            </div>
          )}

          <SidebarTree
            userId={userId}
            areas={areas}
            collapsed={collapsed}
            graduationYear={graduationYear}
            addOptimisticArea={addOptimisticArea}
          />
        </div>
      </div>

      {/* Footer: show archived toggle */}
      <div className="border-t border-border px-3 py-2 shrink-0">
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleShowArchived}
            className={cn(
              "w-full text-left text-[13px] font-sans text-muted-foreground hover:text-foreground py-1 px-1 rounded-md hover:bg-secondary transition-colors",
              showArchived && "text-foreground",
            )}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        ) : (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleShowArchived}
                  className={cn(
                    "w-full flex justify-center text-[13px] font-sans text-muted-foreground hover:text-foreground py-1 rounded-md hover:bg-secondary transition-colors",
                    showArchived && "text-foreground",
                  )}
                  aria-label={showArchived ? "Hide archived" : "Show archived"}
                >
                  <span>{showArchived ? "●" : "○"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {showArchived ? "Hide archived" : "Show archived"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </aside>
  );
}
