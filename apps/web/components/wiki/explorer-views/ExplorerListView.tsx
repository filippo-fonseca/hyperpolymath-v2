"use client";

import { OverflowTooltip } from "@/components/ui/OverflowTooltip";
import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import { PageIcon } from "@/components/ui/icons/PageIcon";
import { partitionExplorerItems } from "@/components/wiki/explorer-hooks/explorer-items";
import type { SelectionClickModifiers } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import { type PaletteToken, coercePaletteToken, paletteClass } from "@/lib/ui/palette";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export interface ExplorerListViewProps {
  items: ExplorerItem[];
  isSelected: (id: string) => boolean;
  onItemClick: (id: string, mods: SelectionClickModifiers) => void;
  onItemOpen: (item: ExplorerItem) => void;
  rejectedDragId?: string | null;
  onItemContextMenu?: (event: MouseEvent, item: ExplorerItem) => void;
  renderItemChrome?: (item: ExplorerItem, node: ReactNode) => ReactNode;
  folderProjectNames: Map<string, string[]>;
  successfulDropId?: string | null;
}

const LIST_GRID_TEMPLATE = "minmax(0,1fr) 110px 160px minmax(0,220px)";

export function ExplorerListView({
  items,
  isSelected,
  onItemClick,
  onItemOpen,
  rejectedDragId,
  onItemContextMenu,
  renderItemChrome,
  folderProjectNames,
  successfulDropId,
}: ExplorerListViewProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const bands = partitionExplorerItems(items);
  return (
    // aug-04 craft-ui-v2: bare rows on the surface — no per-row cards and no
    // card wrapper around the list; the hover fill and the section labels do
    // the structural work (Craft's Tasks-hub row grammar).
    <div className="font-sans text-meta text-[var(--ink)]" data-view="list">
      <ExplorerListHeaderRow />
      <ExplorerListBand
        label="Folders"
        items={bands.folders}
        isSelected={isSelected}
        rejectedDragId={rejectedDragId}
        onItemClick={onItemClick}
        onItemOpen={onItemOpen}
        onItemContextMenu={onItemContextMenu}
        renderItemChrome={renderItemChrome}
        folderProjectNames={folderProjectNames}
        successfulDropId={successfulDropId}
        reduceMotion={reduceMotion}
      />
      <ExplorerListBand
        label="Files"
        items={bands.pages}
        isSelected={isSelected}
        rejectedDragId={rejectedDragId}
        onItemClick={onItemClick}
        onItemOpen={onItemOpen}
        onItemContextMenu={onItemContextMenu}
        renderItemChrome={renderItemChrome}
        folderProjectNames={folderProjectNames}
        successfulDropId={successfulDropId}
        reduceMotion={reduceMotion}
      />
    </div>
  );
}

function ExplorerListBand({
  label,
  items,
  isSelected,
  rejectedDragId,
  onItemClick,
  onItemOpen,
  onItemContextMenu,
  renderItemChrome,
  folderProjectNames,
  successfulDropId,
  reduceMotion,
}: ExplorerListViewProps & { label: string; reduceMotion: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-2 first-of-type:mt-0">
      <h2 className="px-3 pb-1 pt-2 text-micro font-medium text-[var(--sd-ink-dull)]">{label}</h2>
      <ul>
        {items.map((item) => {
          const id = explorerItemId(item);
          const row = (
            <ExplorerListRow
              key={id}
              item={item}
              selected={isSelected(id)}
              rejected={rejectedDragId === id}
              onClick={(event) =>
                onItemClick(id, {
                  metaKey: event.metaKey,
                  ctrlKey: event.ctrlKey,
                  shiftKey: event.shiftKey,
                })
              }
              onDoubleClick={() => onItemOpen(item)}
              onContextMenu={(event) => onItemContextMenu?.(event, item)}
              folderProjectNames={folderProjectNames}
              dropSucceeded={successfulDropId === id}
              reduceMotion={reduceMotion}
            />
          );
          const wrapped = renderItemChrome ? renderItemChrome(item, row) : row;
          return <li key={id}>{wrapped}</li>;
        })}
      </ul>
    </section>
  );
}

function ExplorerListHeaderRow() {
  return (
    <div
      className="grid h-7 items-center gap-3 border-b border-[var(--edge)] px-3 font-sans text-micro font-medium text-[var(--sd-ink-dull)]"
      style={{ gridTemplateColumns: LIST_GRID_TEMPLATE }}
    >
      <span>Name</span>
      <span>Kind</span>
      <span>Updated</span>
      <span>Projects</span>
    </div>
  );
}

function ExplorerListRow({
  item,
  selected,
  rejected,
  onClick,
  onDoubleClick,
  onContextMenu,
  folderProjectNames,
  dropSucceeded,
  reduceMotion,
}: {
  item: ExplorerItem;
  selected: boolean;
  rejected: boolean;
  onClick: (event: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  folderProjectNames: Map<string, string[]>;
  dropSucceeded: boolean;
  reduceMotion: boolean;
}) {
  const id = explorerItemId(item);
  const droppableId = item.kind === "folder" ? `folder:${item.id}` : undefined;
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: droppableId ?? `noop:${id}`,
    disabled: !droppableId,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id,
    data: { kind: item.kind },
  });

  const setRef = (node: HTMLButtonElement | null) => {
    setDraggableRef(node);
    if (droppableId) setDroppableRef(node);
  };

  const style: CSSProperties = { opacity: isDragging ? 0.4 : 1 };

  const name = item.kind === "folder" ? item.folder.name : item.page.title || "Untitled";
  const kindLabel = item.kind === "folder" ? "Folder" : "Page";
  const updated =
    item.kind === "page"
      ? formatDistanceToNow(new Date(item.page.updatedAt), { addSuffix: true })
      : item.folder.updatedAt
        ? formatDistanceToNow(new Date(item.folder.updatedAt), { addSuffix: true })
        : "—";
  const projectNames =
    item.kind === "page"
      ? item.page.projects.map((project) => project.name)
      : (folderProjectNames.get(item.id) ?? []);

  return (
    <button
      type="button"
      ref={setRef}
      {...attributes}
      {...listeners}
      aria-describedby={undefined}
      data-explorer-id={id}
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={cn(
        "relative grid h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[var(--ink)] outline-none",
        "transition-[background-color] duration-[160ms] ease-out hover:bg-[var(--hover)]",
        "focus-visible:bg-[var(--hover)]",
        selected && "bg-[var(--sd-selected-item)]",
        isOver && "bg-[color-mix(in_srgb,var(--sd-accent)_10%,var(--sd-box))]",
        rejected && !reduceMotion && "animate-[explorer-drop-denied_180ms_ease-in-out_2]"
      )}
      style={{ ...style, gridTemplateColumns: LIST_GRID_TEMPLATE }}
    >
      {selected ? (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-[var(--sd-accent)]"
        />
      ) : null}
      <span className="flex min-w-0 items-center gap-2">
        {item.kind === "folder" ? (
          // A painted folder wears its colour in the list too, or the row and
          // the grid tile would disagree about what the same folder looks like.
          <span
            className={cn(
              "inline-flex shrink-0",
              coercePaletteToken(item.folder.color)
                ? `${paletteClass(coercePaletteToken(item.folder.color) as PaletteToken)} text-[var(--tint-edge)]`
                : undefined
            )}
          >
            <FolderIcon
              size={20}
              variant="closed"
              dropTarget={isOver}
              className={cn(
                dropSucceeded && !reduceMotion && "animate-[explorer-folder-swallow_160ms_ease-out]"
              )}
            />
          </span>
        ) : (
          <PageIcon size={20} kind={item.page.dailyDate ? "daily" : "note"} />
        )}
        <OverflowTooltip text={name} className="min-w-0" />
        {item.kind === "page" && item.page.pinned ? (
          <Star
            size={11}
            strokeWidth={1.5}
            fill="currentColor"
            className="shrink-0 text-[var(--ink-amber)]"
            aria-label="Starred"
          />
        ) : null}
      </span>
      <span className="text-micro text-[var(--sd-ink-dull)]">{kindLabel}</span>
      <span className="truncate text-micro text-[var(--sd-ink-dull)]">{updated}</span>
      <ProjectChips names={projectNames} />
    </button>
  );
}

function ProjectChips({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-micro text-[var(--sd-ink-faint)]">—</span>;
  }
  // Chips inside a bordered list card lose their border and read as fills,
  // per the one-border-per-nesting-level rule (SDC-1 §2.6).
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {names.slice(0, 2).map((name) => (
        <OverflowTooltip
          key={name}
          text={name}
          className="max-w-[90px] rounded-full bg-[var(--hover)] px-2 py-0.5 text-micro leading-none text-[var(--sd-ink-dull)]"
        />
      ))}
      {names.length > 2 ? (
        <span className="shrink-0 rounded-full bg-[var(--hover)] px-2 py-0.5 text-micro leading-none text-[var(--sd-ink-dull)]">
          +{names.length - 2}
        </span>
      ) : null}
    </span>
  );
}
