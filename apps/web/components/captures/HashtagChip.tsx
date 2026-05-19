"use client";

import { cn } from "@/lib/utils";

interface Props {
  displayName: string;
  isSelected?: boolean;
  isNew?: boolean;
  onClick?: () => void;
  asButton?: boolean;
}

/**
 * Phase 06.1 Plan 04 (UI-SPEC §5i, §9g) — sage hashtag chip.
 *
 * Color contract:
 *   - idle    : bg rgb(101 163 13 / 0.12), text --ink
 *   - hover   : bg rgb(101 163 13 / 0.18) over 100ms --ease-out-quart
 *   - active  : bg rgb(101 163 13 / 0.22), text --ink-sage (selected/filter)
 *   - "new"   : same sage register with italic "(new)" suffix — used in the
 *     composer suggestion popover only
 *
 * Type register: font-mono 12px — metadata chrome family, distinguishes the
 * chip from serif body text per UI-SPEC §4a. NO cyan anywhere on this chip;
 * captures surfaces never use HUD cyan.
 *
 * Use `asButton={false}` for purely visual chips inside capture text bodies.
 */
export function HashtagChip({
  displayName,
  isSelected,
  isNew,
  onClick,
  asButton = true,
}: Props) {
  const className = cn(
    "inline-flex items-center font-mono text-xs font-normal rounded-sm px-2 py-0.5",
    "transition-colors duration-100 ease-out",
    // Sage alpha ladder per UI-SPEC §9g
    isSelected
      ? "bg-[color:rgb(101_163_13_/_0.22)] text-[var(--ink-sage)]"
      : isNew
        ? "bg-[color:rgb(101_163_13_/_0.18)] text-[var(--ink-sage)] italic"
        : "bg-[color:rgb(101_163_13_/_0.12)] text-[var(--ink)]",
    asButton && !isSelected && "hover:bg-[color:rgb(101_163_13_/_0.18)]",
    asButton && "cursor-pointer-always",
  );

  const content = (
    <>
      #{displayName}
      {isNew ? <span className="italic ml-1">(new)</span> : null}
    </>
  );

  if (!asButton) {
    return <span className={className}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      data-active={isSelected ? "true" : "false"}
    >
      {content}
    </button>
  );
}
