"use client";

import { Tile } from "@/components/ui/explorer";
import { partitionExplorerItems } from "@/components/wiki/explorer-hooks/explorer-items";
import type { SelectionClickModifiers } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import { PageIcon } from "@/components/ui/icons/PageIcon";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useRef } from "react";

/** Shared design contract §2.7: stagger is min(i, 12) * 20ms, capped at 240ms. */
const STAGGER_LIMIT = 12;
const STAGGER_STEP = 0.02;
/** §2.7: enter/exit is 220ms on --ease-out-quart cubic-bezier(0.25, 1, 0.5, 1). */
const ENTER_DURATION = 0.22;
const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

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

  // The stagger runs once, on the grid's first paint. Every later render is a
  // folder navigation, and a per-item delay there is pure added latency: the
  // tiles are already the answer to a click the user just made, so they land
  // together. §2.7 sanctions gating the stagger on first mount for exactly this.
  const firstPaint = useRef(true);
  const stagger = firstPaint.current && !reduceMotion;
  useEffect(() => {
    firstPaint.current = false;
  }, []);

  const bandProps = {
    reduceMotion: Boolean(reduceMotion),
    stagger,
    isSelected,
    rejectedDragId,
    successfulDropId,
    onItemClick,
    onItemOpen,
    onItemContextMenu,
    renderItemChrome,
  };

  return (
    <div className="space-y-7" data-view="grid">
      {/* The bands are conditionally rendered HERE rather than returning null
          from inside ExplorerGridBand. AnimatePresence only sees a removal when
          its own child disappears; a custom component that renders null is
          still mounted as far as it is concerned, so exits never ran and the
          band boxes popped out instead of fading. */}
      <AnimatePresence initial={false}>
        {bands.folders.length > 0 ? (
          <ExplorerGridBand
            key="folders"
            label="Folders"
            items={bands.folders}
            indexOffset={0}
            {...bandProps}
          />
        ) : null}
        {bands.pages.length > 0 ? (
          <ExplorerGridBand
            key="pages"
            label="Files"
            items={bands.pages}
            indexOffset={bands.folders.length}
            {...bandProps}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ExplorerGridBand({
  label,
  items,
  indexOffset,
  reduceMotion,
  stagger,
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
  stagger: boolean;
}) {
  return (
    <motion.section
      className="space-y-2.5"
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : ENTER_DURATION } }}
    >
      <h2 className="px-0.5 font-sans text-[0.72rem] font-semibold text-[var(--sd-ink-dull)]">
        {label}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2">
        {items.map((item, index) => {
          const id = explorerItemId(item);
          const selected = isSelected(id);
          const delay = stagger ? Math.min(index + indexOffset, STAGGER_LIMIT) * STAGGER_STEP : 0;
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
            // Opacity only, and no `layout`. Both matter, for the same reason:
            // Motion's layout projection and a `y` transform write the same
            // `transform` property, so an entry interrupted by a re-render (a
            // folder navigation, a realtime refetch) settled at
            // translateY(4px) and the tile sat visibly below its row. That is
            // the drooping folder card, and §2.7 bans the combination outright.
            <motion.div
              key={id}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{
                opacity: 1,
                transition: {
                  duration: reduceMotion ? 0 : ENTER_DURATION,
                  delay,
                  ease: EASE_OUT_QUART,
                },
              }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : ENTER_DURATION } }}
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
      <Tile
        selected={selected}
        dropTarget={isOver}
        media={
          item.kind === "folder" ? (
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
          )
        }
        label={name}
        caption={caption}
      />
    </button>
  );
}
