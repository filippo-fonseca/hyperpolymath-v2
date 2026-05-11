"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { PersistentNav } from "./PersistentNav";
import { SidebarTree } from "./SidebarTree";
import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  initialActiveAreas: SidebarArea[];
  initialAllAreas: SidebarArea[];
  graduationYear?: number | null;
}

export function Sidebar({ initialActiveAreas, initialAllAreas, graduationYear }: Props) {
  // Hydration safety (Pitfall 16): Read localStorage inside useEffect, NOT during render.
  // Initial render uses defaults; flicker on first paint is masked by the 200ms collapse animation.
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

  const areas = showArchived ? initialAllAreas : initialActiveAreas;

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
              <AreaCreateDialog>
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
              <AreaCreateDialog>
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

          <SidebarTree areas={areas} collapsed={collapsed} graduationYear={graduationYear} />
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
