"use client";

import {
  type ExplorerBreadcrumbSegment,
  ExplorerBreadcrumbs,
  type ExplorerSortValue,
  ExplorerTopBar,
  type ExplorerViewMode,
  SortSelect,
  ViewToggle,
} from "@/components/wiki/explorer";
import { ExplorerNewMenu } from "@/components/wiki/explorer-parts/ExplorerNewMenu";
import { ExplorerSfxToggle } from "@/components/wiki/explorer-parts/ExplorerSfxToggle";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import type { ReactNode, RefObject } from "react";

interface ExplorerHeaderControlsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  breadcrumbSegments: ExplorerBreadcrumbSegment[];
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onCreatePage: () => void;
  onCreateFolder: () => void;
  view: ExplorerViewMode;
  onViewChange: (v: ExplorerViewMode) => void;
  sort: ExplorerSortValue;
  onSortChange: (s: ExplorerSortValue) => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

export function ExplorerHeaderControls({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  breadcrumbSegments,
  search,
  onSearchChange,
  searchInputRef,
  onCreatePage,
  onCreateFolder,
  view,
  onViewChange,
  sort,
  onSortChange,
  inspectorOpen,
  onToggleInspector,
}: ExplorerHeaderControlsProps) {
  return (
    <ExplorerTopBar
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onBack={onBack}
      onForward={onForward}
      breadcrumbs={
        <ExplorerBreadcrumbs
          segments={breadcrumbSegments}
          renderSegment={(seg, def) => <BreadcrumbDroppable id={seg.id}>{def}</BreadcrumbDroppable>}
        />
      }
      search={
        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search wiki (press /)"
            className={cn(
              "h-8 w-full rounded-lg bg-[var(--sd-input)] pl-7 pr-2 text-meta text-[var(--sd-ink)] outline-none",
              "transition-[background-color] duration-[160ms] ease-out",
              "placeholder:text-[var(--sd-ink-faint)] focus:bg-[var(--sd-hover)]"
            )}
          />
        </div>
      }
      controls={
        <>
          <ExplorerNewMenu onNewFolder={onCreateFolder} onNewPage={onCreatePage} />
          <ViewToggle value={view} onChange={onViewChange} />
          <SortSelect value={sort} onValueChange={onSortChange} />
          <ExplorerSfxToggle />
          <button
            type="button"
            onClick={onToggleInspector}
            aria-pressed={inspectorOpen}
            aria-label={inspectorOpen ? "Close inspector" : "Open inspector"}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg bg-[var(--sd-box)] text-[var(--ink-muted)]",
              "transition-[background-color,color] duration-[160ms] ease-out hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]",
              inspectorOpen && "bg-[var(--sd-selected)] text-[var(--sd-accent)]"
            )}
          >
            {inspectorOpen ? (
              <PanelRightClose size={14} strokeWidth={1.8} />
            ) : (
              <PanelRightOpen size={14} strokeWidth={1.8} />
            )}
          </button>
        </>
      }
    />
  );
}

function BreadcrumbDroppable({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <span
      ref={setNodeRef}
      className={cn(
        // min-w-0/max-w-full so a long current crumb can truncate with … inside
        // the toolbar slot instead of being clipped mid-character by overflow.
        "inline-flex min-w-0 max-w-full rounded-lg transition-[background-color,box-shadow] duration-[160ms] ease-out",
        isOver &&
          "bg-[color-mix(in_oklch,var(--sd-accent)_12%,transparent)] shadow-[inset_0_0_0_1px_var(--sd-accent)]"
      )}
    >
      {children}
    </span>
  );
}
