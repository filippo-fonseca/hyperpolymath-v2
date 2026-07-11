"use client";

import { partitionExplorerItems } from "@/components/wiki/explorer-hooks/explorer-items";
import type { SelectionClickModifiers } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import { FolderIcon } from "@/components/wiki/icons/FolderIcon";
import { PageIcon } from "@/components/wiki/icons/PageIcon";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

const STAGGER_LIMIT = 24;

export interface ExplorerGridViewProps {
  items: ExplorerItem[];
  isSelected: (id: string) => boolean;
  onItemClick: (id: string, mods: SelectionClickModifiers) => void;
  onItemOpen: (item: ExplorerItem) => void;
  rejectedDragId?: string | null;
  successfulDropId?: string | null;
  onItemContextMenu?: (event: MouseEvent, item: ExplorerItem) => void;
  renderItemChrome?: (item: ExplorerItem, node: ReactNode) => ReactNode;
}

/** Spacedrive tile grid in strict Drive-style folder and file bands. */
export function ExplorerGridView({
  items,
  isSelected,
  onItemClick,
  onItemOpen,
  rejectedDragId,
  successfulDropId,
  onItemContextMenu,
  renderItemChrome,
}: ExplorerGridViewProps) {
  const reduceMotion = useReducedMotion();
  const bands = partitionExplorerItems(items);

  return (
    <div className="space-y-7" data-view="grid">
      <AnimatePresence initial={false}>
        <ExplorerGridBand
          key="folders"
          label="Folders"
          items={bands.folders}
          indexOffset={0}
          reduceMotion={Boolean(reduceMotion)}
          isSelected={isSelected}
          rejectedDragId={rejectedDragId}
          successfulDropId={successfulDropId}
          onItemClick={onItemClick}
          onItemOpen={onItemOpen}
          onItemContextMenu={onItemContextMenu}
          renderItemChrome={renderItemChrome}
        />
        <ExplorerGridBand
          key="pages"
          label="Files"
          items={bands.pages}
          indexOffset={bands.folders.length}
          reduceMotion={Boolean(reduceMotion)}
          isSelected={isSelected}
          rejectedDragId={rejectedDragId}
          successfulDropId={successfulDropId}
          onItemClick={onItemClick}
          onItemOpen={onItemOpen}
          onItemContextMenu={onItemContextMenu}
          renderItemChrome={renderItemChrome}
        />
      </AnimatePresence>
    </div>
  );
}

function ExplorerGridBand({
  label,
  items,
  indexOffset,
  reduceMotion,
  isSelected,
  rejectedDragId,
  successfulDropId,
  onItemClick,
  onItemOpen,
  onItemContextMenu,
  renderItemChrome,
}: ExplorerGridViewProps & {
  label: string;
  indexOffset: number;
  reduceMotion: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <motion.section layout={!reduceMotion} className="space-y-2.5">
      <h2 className="px-0.5 font-sans text-[0.72rem] font-semibold text-[var(--sd-ink-dull)]">
        {label}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2">
        {items.map((item, index) => {
          const id = explorerItemId(item);
          const selected = isSelected(id);
          const delay = reduceMotion ? 0 : Math.min(index + indexOffset, STAGGER_LIMIT) * 0.01;
          const tile = (
            <ExplorerGridTile
              key={id}
              item={item}
              selected={selected}
              rejected={rejectedDragId === id}
              dropSucceeded={successfulDropId === id}
              reduceMotion={reduceMotion}
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
          const wrapped = renderItemChrome ? renderItemChrome(item, tile) : tile;
          return (
            <motion.div
              key={id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.18, delay, ease: "easeOut" } }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, transition: { duration: 0.12 } }
              }
            >
              {wrapped}
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

function ExplorerGridTile({
  item,
  selected,
  rejected,
  dropSucceeded,
  reduceMotion,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  item: ExplorerItem;
  selected: boolean;
  rejected: boolean;
  dropSucceeded: boolean;
  reduceMotion: boolean;
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

  const style: CSSProperties = {
    opacity: isDragging ? 0.4 : 1,
  };

  const name = item.kind === "folder" ? item.folder.name : item.page.title || "Untitled";
  const caption =
    item.kind === "folder"
      ? item.itemCount === 0
        ? "Empty"
        : `${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`
      : "Page";

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
        "group flex min-h-[154px] flex-col items-center rounded-[8px] border border-transparent p-1.5 text-center outline-none",
        "transition-[background-color,border-color,transform] duration-[140ms] ease-out hover:bg-[var(--sd-box)] focus-visible:border-[var(--sd-accent)]",
        selected &&
          "border-[var(--sd-accent)] bg-[color-mix(in_srgb,var(--sd-accent)_8%,var(--sd-selected-item))]",
        isOver &&
          "border-[var(--sd-accent)] bg-[color-mix(in_srgb,var(--sd-accent)_12%,var(--sd-selected-item))]",
        isOver && !reduceMotion && "scale-[1.02]",
        rejected && !reduceMotion && "animate-[explorer-drop-denied_180ms_ease-in-out_2]"
      )}
    >
      <div
        className={cn(
          "relative grid aspect-square w-full max-w-[110px] place-items-center rounded-[8px]",
          (selected || isOver) && "bg-[var(--sd-selected-item)]"
        )}
      >
        {item.kind === "folder" ? (
          <FolderIcon
            size={78}
            variant={isOver ? "open" : "closed"}
            dropTarget={isOver}
            className={cn(
              dropSucceeded && !reduceMotion && "animate-[explorer-folder-swallow_160ms_ease-out]"
            )}
          />
        ) : (
          <>
            <PageIcon size={74} kind="note" />
            {item.page.emoji ? (
              <span className="absolute bottom-3 right-3 grid size-6 place-items-center rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] text-[13px] shadow-sm">
                {item.page.emoji}
              </span>
            ) : null}
          </>
        )}
      </div>
      <div className="mt-1 min-w-0 max-w-full">
        <div
          className={cn(
            "truncate rounded-[6px] px-1.5 py-0.5 font-sans text-[0.8rem] font-medium text-[var(--sd-ink)]",
            selected && "bg-[var(--sd-accent)] text-white"
          )}
        >
          {name}
        </div>
        <div className="truncate rounded-[6px] px-1.5 py-px font-sans text-[0.65rem] text-[var(--sd-ink-dull)]">
          {caption}
        </div>
      </div>
    </button>
  );
}
