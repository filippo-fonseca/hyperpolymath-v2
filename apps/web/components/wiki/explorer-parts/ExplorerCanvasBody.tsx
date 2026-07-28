"use client";

import { SelectionRubberBand } from "@/components/wiki/explorer";
import type { ExplorerViewMode } from "@/components/wiki/explorer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExplorerEmptySpaceMenu } from "@/components/wiki/explorer-parts/ExplorerEmptySpaceMenu";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { ExplorerGridView } from "@/components/wiki/explorer-views/ExplorerGridView";
import { ExplorerListView } from "@/components/wiki/explorer-views/ExplorerListView";
import { ExplorerSearchResults } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import type { ExplorerSearchHit } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { FilePlus2, Search } from "lucide-react";
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
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
  ) => void;
  cursor: string | null;
  rejectedDragId: string | null;
  successfulDropId: string | null;
  onItemOpen: (item: ExplorerItem) => void;
  onSearchPageOpen: (page: PageWithProjects) => void;

  renderItemChromeGrid: (item: ExplorerItem, node: ReactNode) => ReactNode;
  renderItemChromeList: (item: ExplorerItem, node: ReactNode) => ReactNode;
  folderProjectNames: Map<string, string[]>;

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
  rejectedDragId,
  successfulDropId,
  onItemOpen,
  onSearchPageOpen,
  renderItemChromeGrid,
  renderItemChromeList,
  folderProjectNames,
  onCreatePage,
  onOpenNewFolder,
}: ExplorerCanvasBodyProps) {
  return (
    <ExplorerEmptySpaceMenu onNewPage={onCreatePage} onNewFolder={onOpenNewFolder}>
      <div
        ref={canvasRef}
        className="relative isolate z-10 h-full min-h-0 overflow-y-auto bg-[var(--sd-app)] p-4"
        onPointerDown={onCanvasPointerDown}
      >
        {searchActive ? (
          searchHits.length === 0 ? (
            <EmptyState
              size="section"
              icon={<Search strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
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
            size="section"
            icon={<FilePlus2 strokeWidth={1.25} className="text-[var(--ink-muted)]" />}
            title="A brand new wiki"
            description="Create your first folder or page and it lands here."
            action={{ label: "New page", onClick: onCreatePage }}
          />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            size="section"
            title="Empty folder"
            description="Drop something in, or make a new page here."
            action={{ label: "New page here", onClick: onCreatePage }}
          />
        ) : view === "grid" ? (
          <ExplorerGridView
            items={visibleItems}
            isSelected={isSelected}
            onItemClick={onItemClick}
            onItemOpen={onItemOpen}
            rejectedDragId={rejectedDragId}
            successfulDropId={successfulDropId}
            renderItemChrome={renderItemChromeGrid}
          />
        ) : (
          <ExplorerListView
            items={visibleItems}
            isSelected={isSelected}
            onItemClick={onItemClick}
            onItemOpen={onItemOpen}
            rejectedDragId={rejectedDragId}
            successfulDropId={successfulDropId}
            renderItemChrome={renderItemChromeList}
            folderProjectNames={folderProjectNames}
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
      className={cn("relative", isOver && "shadow-[inset_0_-2px_0_var(--sd-accent)]")}
    >
      {children}
    </div>
  );
}
