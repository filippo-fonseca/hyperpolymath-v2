"use client";

import { useEffect, useOptimistic, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { PersistentNav } from "./PersistentNav";
import { SidebarTree } from "./SidebarTree";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
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
 *
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5e + §7a + §12e):
 *
 * Diplomatic chrome. --surface background, 1px --edge right border. Section
 * labels render as mono 12px uppercase tracking-wide (AREAS / JARVIS /
 * NAVIGATE per UI-SPEC §12e). The active route's nav link gets a 1px
 * --edge-hud LEFT-edge accent (not a background fill); the JARVIS link
 * additionally gets a 4px --hud-cyan dot when /jarvis is current — the one
 * place cyan touches diplomatic chrome (UI-SPEC §5e). Hover transitions
 * 100ms text-muted → ink.
 *
 * Layout grid carries forward unchanged (UI-SPEC §14). Mechanism for
 * optimistic state + Realtime + collapse state is untouched — ONLY
 * typography + edges + copy register update.
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
        "flex flex-col h-full bg-[var(--surface)] border-r border-[var(--edge)] shrink-0 overflow-hidden",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-[260px]",
        // Prevent layout shift before mounted (localStorage read)
        !mounted && "invisible",
      )}
      aria-label="Sidebar"
    >
      {/* Header: Wordmark + collapse toggle */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--edge)]">
        <Wordmark collapsed={collapsed} />
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="shrink-0 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out"
              >
                {collapsed ? (
                  <ChevronRight size={14} strokeWidth={1.5} />
                ) : (
                  <ChevronLeft size={14} strokeWidth={1.5} />
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
        {/* NAVIGATE section — primary nav links (PersistentNav owns the items + the active-edge accent) */}
        {!collapsed && (
          <div className="px-3 mb-1 mt-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] select-none">
              NAVIGATE
            </span>
          </div>
        )}
        <PersistentNav collapsed={collapsed} />

        {/* AREAS section */}
        <div className="mt-4">
          {!collapsed && (
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] select-none">
                AREAS
              </span>
              <AreaCreateDialog
                userId={userId}
                addOptimisticArea={addOptimisticArea}
                currentAreaCount={activeAreas.length}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Create area"
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out"
                >
                  <Plus size={12} strokeWidth={1.5} />
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
                        aria-label="Create area"
                        className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out"
                      >
                        <Plus size={12} strokeWidth={1.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Create area</TooltipContent>
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

        {/* JARVIS section — agent-adjacent surfaces (memory + future agent destinations) */}
        {!collapsed && (
          <div className="mt-6 px-3 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] select-none">
              JARVIS
            </span>
          </div>
        )}
        {!collapsed && (
          <nav aria-label="JARVIS navigation" className="px-2">
            <SidebarSectionLink href="/settings/memory" label="Memory" />
          </nav>
        )}
      </div>

      {/* Footer: theme toggle + show archived toggle */}
      <div className="border-t border-[var(--edge)] px-3 py-2 shrink-0 space-y-2">
        {/* Phase 6 Plan 06-01 (SET-03, AES-06, D-06) — theme toggle anchored
            in sidebar footer; renders header variant even when collapsed
            (36px icon button fits the 16-wide collapsed sidebar). */}
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-start")}>
          <ThemeToggle variant="header" />
        </div>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleShowArchived}
            className={cn(
              "w-full text-left font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] py-1 px-1 rounded-sm transition-colors duration-100 ease-out",
              showArchived && "text-[var(--ink)]",
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
                    "w-full flex justify-center font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] py-1 rounded-sm transition-colors duration-100 ease-out",
                    showArchived && "text-[var(--ink)]",
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

/**
 * Local sibling component used by the JARVIS sub-section. Mirrors the
 * active-edge accent style used by PersistentNav so behavior is consistent.
 * Kept local to avoid a circular export chain with PersistentNav.
 *
 * Active-route detection mirrors PersistentNav's `pathname?.startsWith(href)`
 * convention. When active, the link draws a 1px --edge-hud LEFT-edge accent
 * (UI-SPEC §5e — diplomatic chrome active-state register). Hover transition
 * runs at 100ms per UI-SPEC §7a Sidebar motion.
 */
function SidebarSectionLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = !!pathname?.startsWith(href);
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1",
        "font-mono text-[11px] uppercase tracking-[0.06em]",
        "border-l-2 transition-colors duration-100 ease-out cursor-pointer-always",
        isActive
          ? "border-l-[var(--edge-hud)] text-[var(--ink)]"
          : "border-l-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]",
      )}
    >
      {label}
    </a>
  );
}
