"use client";

import { partitionExplorerItems } from "@/components/wiki/explorer-hooks/explorer-items";
import type { SelectionClickModifiers } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import { FolderIcon } from "@/components/wiki/icons/FolderIcon";
import { PageIcon } from "@/components/wiki/icons/PageIcon";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export interface ExplorerListViewProps {
  items: ExplorerItem[];
  isSelected: (id: string) => boolean;
  onItemClick: (id: string, mods: SelectionClickModifiers) => void;
  onItemOpen: (item: ExplorerItem) => void;
  rejectedDragId?: string | null;
  onItemContextMenu?: (event: MouseEvent, item: ExplorerItem) => void;
  renderItemChrome?: (item: ExplorerItem, node: ReactNode) => ReactNode;
}

export function ExplorerListView({
  items,
  isSelected,
  onItemClick,
  onItemOpen,
  rejectedDragId,
  onItemContextMenu,
  renderItemChrome,
}: ExplorerListViewProps) {
  const bands = partitionExplorerItems(items);
  return (
    <div
      className="rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)] font-sans text-[0.8rem] text-[var(--ink)]"
      data-view="list"
    >
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
}: ExplorerListViewProps & { label: string }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="border-b border-[var(--sd-line)] bg-[var(--sd-dark-box)] px-3 py-1.5 text-[0.68rem] font-semibold text-[var(--sd-ink-dull)]">
        {label}
      </h2>
      <ul className="divide-y divide-[var(--sd-divider)]">
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
      className="grid h-7 items-center gap-3 border-b border-[var(--sd-divider)] px-3 font-sans text-[0.65rem] font-semibold text-[var(--sd-ink-dull)]"
      style={{ gridTemplateColumns: "minmax(0,2fr) 96px 128px minmax(0,1.2fr)" }}
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
}: {
  item: ExplorerItem;
  selected: boolean;
  rejected: boolean;
  onClick: (event: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
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
      : "";
  const projects = item.kind === "page" ? item.page.projects : [];

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
      style={style}
      className={cn(
        "relative grid h-8 items-center gap-3 px-3 text-[var(--ink)] outline-none",
        "transition-[background-color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)]",
        "focus-visible:bg-[var(--sd-hover)] focus-visible:shadow-[inset_0_0_0_1px_var(--sd-accent)]",
        selected && "bg-[var(--sd-selected-item)]",
        isOver &&
          "bg-[color-mix(in_srgb,var(--sd-accent)_10%,var(--sd-box))] shadow-[inset_0_0_0_1px_var(--sd-accent)]",
        rejected && "animate-[explorer-drop-denied_180ms_ease-in-out_2]"
      )}
    >
      {selected ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[var(--sd-accent)]" />
      ) : null}
      <div
        className="grid min-w-0 items-center gap-3"
        style={{ gridTemplateColumns: "minmax(0,2fr) 96px 128px minmax(0,1.2fr)" }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {item.kind === "folder" ? (
            <FolderIcon size={20} variant="closed" dropTarget={isOver} />
          ) : (
            <PageIcon size={20} kind={item.page.dailyDate ? "daily" : "note"} />
          )}
          <span className="truncate">{name}</span>
        </span>
        <span className="text-[0.7rem] text-[var(--sd-ink-dull)]">{kindLabel}</span>
        <span className="truncate text-[0.7rem] text-[var(--sd-ink-dull)]">{updated}</span>
        <span className="min-w-0 truncate text-[0.75rem] text-[var(--ink-muted)]">
          {projects.length > 0 ? projects.map((p) => p.name).join(", ") : ""}
        </span>
      </div>
    </button>
  );
}
