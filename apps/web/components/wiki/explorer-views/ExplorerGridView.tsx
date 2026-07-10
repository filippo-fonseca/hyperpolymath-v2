"use client";

import { FolderIcon } from "@/components/wiki/icons/FolderIcon";
import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { SelectionClickModifiers } from "@/components/wiki/explorer-hooks/useExplorerSelection";

const STAGGER_LIMIT = 24;

export interface ExplorerGridViewProps {
  items: ExplorerItem[];
  isSelected: (id: string) => boolean;
  onItemClick: (id: string, mods: SelectionClickModifiers) => void;
  onItemOpen: (item: ExplorerItem) => void;
  onItemContextMenu?: (event: MouseEvent, item: ExplorerItem) => void;
  renderItemChrome?: (item: ExplorerItem, node: ReactNode) => ReactNode;
}

/** Drive-style tile grid: folders first, then page preview cards, single column set. */
export function ExplorerGridView({
  items,
  isSelected,
  onItemClick,
  onItemOpen,
  onItemContextMenu,
  renderItemChrome,
}: ExplorerGridViewProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      data-view="grid"
    >
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const id = explorerItemId(item);
          const selected = isSelected(id);
          const delay = reduceMotion ? 0 : Math.min(index, STAGGER_LIMIT) * 0.01;
          const tile = (
            <ExplorerGridTile
              key={id}
              item={item}
              selected={selected}
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
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, transition: { duration: 0.12 } }}
            >
              {wrapped}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ExplorerGridTile({
  item,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  item: ExplorerItem;
  selected: boolean;
  onClick: (event: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  const id = explorerItemId(item);
  const droppableId = item.kind === "folder" ? `folder:${item.id}` : undefined;
  const {
    setNodeRef: setDroppableRef,
    isOver,
  } = useDroppable({ id: droppableId ?? `noop:${id}`, disabled: !droppableId });

  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id,
    data: { kind: item.kind },
  });

  const setRef = (node: HTMLDivElement | null) => {
    setDraggableRef(node);
    if (droppableId) setDroppableRef(node);
  };

  const style: CSSProperties = {
    opacity: isDragging ? 0.4 : 1,
  };

  if (item.kind === "folder") {
    return (
      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        data-explorer-id={id}
        role="button"
        tabIndex={0}
        aria-selected={selected}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        style={style}
        className={cn(
          "group flex h-full min-h-[176px] flex-col items-center justify-between gap-2 rounded-[10px] border p-4 text-center outline-none",
          "border-[var(--sd-line)] bg-[var(--sd-box)]",
          "transition-[background-color,border-color] duration-[120ms] ease-out",
          "hover:bg-[var(--sd-hover)]",
          "focus-visible:border-[var(--hud-cyan)]",
          selected && "border-[var(--hud-cyan)] bg-[var(--sd-selected)]",
          isOver && "border-[var(--hud-cyan)] bg-[color-mix(in_oklch,var(--hud-cyan)_10%,var(--sd-box))]",
        )}
      >
        <FolderIcon size={72} variant="closed" dropTarget={isOver} />
        <div className="min-w-0 space-y-0.5">
          <div className="truncate font-sans text-[0.82rem] font-medium text-[var(--ink)]">
            {item.folder.name}
          </div>
          <div className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
            {item.itemCount === 0
              ? "Empty"
              : `${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setRef}
      {...attributes}
      {...listeners}
      data-explorer-id={id}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={style}
      className="outline-none"
    >
      <PagePreviewCard
        page={item.page}
        icon={item.page.emoji ?? null}
        selected={selected}
      />
    </div>
  );
}
