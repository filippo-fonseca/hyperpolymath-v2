"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** A single overlapping tag dot beneath a tile label (constitution §B). */
export interface TileTag {
  key: string;
  /** CSS color for the dot fill; functional hues only, per accent discipline. */
  color: string;
  label?: string;
}

/**
 * Headless explorer tile anatomy: a square media backplate (8px radius, neutral
 * `--sd-selected-item` fill when selected or a drop target), a truncating label
 * with the two-tier accent-chip selected state, an optional tiny caption row,
 * and an optional overlapping tag-dot row. Purely presentational and
 * data-agnostic; the consumer owns the interactive wrapper (button, drag/drop,
 * context menu). Rendered as a fragment so it drops straight into a tile button.
 */
export function Tile({
  media,
  label,
  caption,
  tags,
  selected = false,
  dropTarget = false,
  labelLines = 1,
  backplateClassName,
}: {
  media: ReactNode;
  label: ReactNode;
  caption?: ReactNode;
  tags?: TileTag[];
  selected?: boolean;
  dropTarget?: boolean;
  /** 1 = single-line truncate (default), 2 = two-line clamp. */
  labelLines?: 1 | 2;
  backplateClassName?: string;
}) {
  return (
    <>
      <div
        className={cn(
          "relative grid aspect-square w-full max-w-[110px] place-items-center rounded-[8px]",
          (selected || dropTarget) && "bg-[var(--sd-selected-item)]",
          backplateClassName
        )}
      >
        {media}
      </div>
      <div className="mt-1 min-w-0 max-w-full">
        <div
          className={cn(
            "rounded px-1 py-0.5 font-sans text-meta font-medium text-[var(--sd-ink)]",
            labelLines === 2 ? "line-clamp-2" : "truncate",
            selected && "bg-[var(--sd-accent)] text-white"
          )}
        >
          {label}
        </div>
        {caption != null ? (
          <div className="truncate rounded px-1 py-px font-sans text-micro text-[var(--sd-ink-dull)]">
            {caption}
          </div>
        ) : null}
        {tags && tags.length > 0 ? (
          <div className="mt-1 flex items-center justify-center px-1.5">
            {tags.map((tag) => (
              <span
                key={tag.key}
                aria-label={tag.label}
                className="-ml-0.5 size-2 rounded-full ring-1 ring-[var(--sd-app)] first:ml-0"
                style={{ backgroundColor: tag.color }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
