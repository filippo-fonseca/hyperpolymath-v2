"use client";

import { OverflowTooltip } from "@/components/ui/OverflowTooltip";
import { partitionExplorerItems } from "@/components/wiki/explorer-hooks/explorer-items";
import type { SelectionClickModifiers } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import { tintFor } from "@/lib/tint";
import { coercePaletteToken, paletteClass } from "@/lib/ui/palette";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Folder, FolderOpen, Star } from "lucide-react";
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

/** Craft-style card grid in strict folder and file bands (aug-04 craft-ui-v2). */
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
    <div className="space-y-8" data-view="grid">
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
      className="space-y-2"
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : ENTER_DURATION } }}
    >
      <h2 className="px-0.5 font-sans text-micro font-medium text-[var(--sd-ink-dull)]">{label}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
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
              // min-w-0: this wrapper is the actual grid item, and without it
              // a long nowrap label's min-content inflates the whole 1fr
              // column (the tile then paints across its neighbors).
              className="min-w-0"
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

  // Folder tile: a white craft card with a pastel icon plate, name in
  // text-body, count in text-micro gray. Selection keeps the pre-craft
  // treatment (strong border + faint accent wash) layered over the card.
  //
  // The plate's hue is the folder's CHOSEN colour when it has one (right-click
  // → Colour), falling back to the id-hashed tint so an unpainted folder still
  // reads as a distinct object rather than a gray box.
  if (item.kind === "folder") {
    const chosen = coercePaletteToken(item.folder.color);
    const caption =
      item.itemCount === 0 ? "Empty" : `${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`;
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
          // w-full: buttons shrink-to-fit their content even as flex containers,
          // so without an explicit width a long nowrap label walks the tile
          // across its neighbors instead of truncating at the grid column.
          "group flex w-full min-w-0 max-w-full flex-col rounded-xl p-3 text-left outline-none",
          // Selected / drop states swap the unlayered craft-card recipe for
          // explicit utilities (unlayered classes beat Tailwind utilities, so
          // composing a state fill over craft-card would silently lose).
          isOver
            ? "border border-[var(--edge-strong)] bg-[color-mix(in_srgb,var(--sd-accent)_12%,var(--sd-selected-item))] shadow-[var(--shadow-card)]"
            : selected
              ? "border border-[var(--edge-strong)] bg-[color-mix(in_srgb,var(--sd-accent)_8%,var(--sd-selected-item))] shadow-[var(--shadow-card)]"
              : "craft-card craft-card-hover",
          rejected && !reduceMotion && "animate-[explorer-drop-denied_180ms_ease-in-out_2]"
        )}
      >
        <span
          className={cn(
            chosen ? paletteClass(chosen) : tintFor(item.id),
            "grid size-9 shrink-0 place-items-center rounded-[10px] border border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] text-[var(--tint-ink)]",
            dropSucceeded && !reduceMotion && "animate-[explorer-folder-swallow_160ms_ease-out]"
          )}
        >
          {isOver ? (
            <FolderOpen size={17} strokeWidth={1.8} aria-hidden />
          ) : (
            <Folder size={17} strokeWidth={1.8} aria-hidden />
          )}
        </span>
        <OverflowTooltip
          text={name}
          className="mt-2 w-full min-w-0 font-sans text-body font-medium text-[var(--ink)]"
        />
        <span className="mt-0.5 font-sans text-micro text-[var(--ink-muted)]">{caption}</span>
      </button>
    );
  }

  // Page tile: the Craft doc card — live mini page preview on white, title in
  // text-body, updated line in text-micro gray (all inside PagePreviewCard).
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
        "group relative w-full min-w-0 max-w-full rounded-xl text-left outline-none",
        rejected && !reduceMotion && "animate-[explorer-drop-denied_180ms_ease-in-out_2]"
      )}
    >
      <PagePreviewCard page={item.page} icon={item.page.emoji ?? null} selected={selected} />
      {/* Starred marker (issue #365) — quiet amber star, top-right. */}
      {item.page.pinned ? (
        <span className="absolute right-2 top-2 text-[var(--ink-amber)]">
          <Star size={13} strokeWidth={1.5} fill="currentColor" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}
