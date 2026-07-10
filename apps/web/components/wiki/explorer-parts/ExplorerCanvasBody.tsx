"use client";

import {
  EmptyState,
  SelectionRubberBand,
} from "@/components/wiki/explorer";
import { ExplorerEmptySpaceMenu } from "@/components/wiki/explorer-parts/ExplorerEmptySpaceMenu";
import { ExplorerGridView } from "@/components/wiki/explorer-views/ExplorerGridView";
import { ExplorerListView } from "@/components/wiki/explorer-views/ExplorerListView";
import { ExplorerSearchResults } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import type { ExplorerSearchHit } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import type { ExplorerViewMode } from "@/components/wiki/explorer";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { Plus, Search } from "lucide-react";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { ReactNode, RefObject } from "react";

interface RubberBandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExplorerCanvasBodyProps {
  canvasRef: RefObject<HTMLDivElement | null>;
  onCanvasPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  rubberBandRect: RubberBandRect | null;

  searchActive: boolean;
  search: string;
  searchHits: ExplorerSearchHit[];

  isEmptyWiki: boolean;
  visibleItems: ExplorerItem[];
  view: ExplorerViewMode;

  isSelected: (id: string) => boolean;
  onItemClick: (
    id: string,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
  ) => void;
  cursor: string | null;
  onItemOpen: (item: ExplorerItem) => void;
  onSearchPageOpen: (page: PageWithProjects) => void;

  renderItemChromeGrid: (item: ExplorerItem, node: ReactNode) => ReactNode;
  renderItemChromeList: (item: ExplorerItem, node: ReactNode) => ReactNode;

  onCreatePage: () => void;
  onOpenNewFolder: () => void;
}

export function ExplorerCanvasBody({
  canvasRef,
  onCanvasPointerDown,
  rubberBandRect,
  searchActive,
  search,
  searchHits,
  isEmptyWiki,
  visibleItems,
  view,
  isSelected,
  onItemClick,
  cursor,
  onItemOpen,
  onSearchPageOpen,
  renderItemChromeGrid,
  renderItemChromeList,
  onCreatePage,
  onOpenNewFolder,
}: ExplorerCanvasBodyProps) {
  return (
    <ExplorerEmptySpaceMenu onNewPage={onCreatePage} onNewFolder={onOpenNewFolder}>
      <div
        ref={canvasRef}
        className="relative min-h-[420px] p-4"
        onPointerDown={onCanvasPointerDown}
      >
        {searchActive ? (
          searchHits.length === 0 ? (
            <EmptyState
              icon={<Search size={22} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
              title="No matches"
              description={`Nothing in the wiki matches "${search.trim()}".`}
            />
          ) : (
            <ExplorerSearchResults
              hits={searchHits}
              onOpen={onSearchPageOpen}
              onSelect={(page, event) =>
                onItemClick(`page:${page.id}`, {
                  metaKey: event.metaKey,
                  ctrlKey: event.ctrlKey,
                  shiftKey: event.shiftKey,
                })
              }
              selectedId={cursor}
            />
          )
        ) : isEmptyWiki ? (
          <EmptyState
            title="A brand new wiki"
            description="Create your first folder or page and it lands here."
            action={
              <>
                <button
                  type="button"
                  onClick={onCreatePage}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink)]",
                    "hover:bg-[var(--sd-hover)]",
                  )}
                >
                  <Plus size={12} strokeWidth={1.8} />
                  New page
                </button>
                <button
                  type="button"
                  onClick={onOpenNewFolder}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink)]",
                    "hover:bg-[var(--sd-hover)]",
                  )}
                >
                  <Plus size={12} strokeWidth={1.8} />
                  New folder
                </button>
              </>
            }
          />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title="Empty folder"
            description="Drop something in, or make a new page here."
            action={
              <button
                type="button"
                onClick={onCreatePage}
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink)]",
                  "hover:bg-[var(--sd-hover)]",
                )}
              >
                <Plus size={12} strokeWidth={1.8} />
                New page here
              </button>
            }
          />
        ) : view === "grid" ? (
          <ExplorerGridView
            items={visibleItems}
            isSelected={isSelected}
            onItemClick={onItemClick}
            onItemOpen={onItemOpen}
            renderItemChrome={renderItemChromeGrid}
          />
        ) : (
          <ExplorerListView
            items={visibleItems}
            isSelected={isSelected}
            onItemClick={onItemClick}
            onItemOpen={onItemOpen}
            renderItemChrome={renderItemChromeList}
          />
        )}
        {rubberBandRect ? (
          <SelectionRubberBand
            x={rubberBandRect.x}
            y={rubberBandRect.y}
            width={rubberBandRect.width}
            height={rubberBandRect.height}
          />
        ) : null}
      </div>
    </ExplorerEmptySpaceMenu>
  );
}

export function ReorderPageWrapper({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `reorder-page:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative",
        isOver && "shadow-[inset_0_-2px_0_var(--hud-cyan)]",
      )}
    >
      {children}
    </div>
  );
}
