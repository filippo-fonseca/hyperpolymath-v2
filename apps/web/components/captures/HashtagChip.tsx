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
 * Color contract (alpha register derived from the brand --ink-sage oklch token
 * via color-mix, not raw Tailwind lime — see issue #43):
 *   - idle    : bg sage @ 12%, text --ink
 *   - hover   : bg sage @ 22% over 100ms --ease-out-quart
 *   - active  : bg sage @ 32%, text --ink (selected/filter — deeper tint
 *               signals selection; keeps high contrast vs. sage-on-sage)
 *   - "new"   : bg sage @ 22%, text --ink-sage italic — used in the composer
 *               suggestion popover only
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
    // Sage alpha ladder per UI-SPEC §9g — bg derived from --ink-sage via color-mix
    isSelected
      ? "bg-[color:color-mix(in_oklch,var(--ink-sage)_32%,transparent)] text-[var(--ink)]"
      : isNew
        ? "bg-[color:color-mix(in_oklch,var(--ink-sage)_22%,transparent)] text-[var(--ink-sage)] italic"
        : "bg-[color:color-mix(in_oklch,var(--ink-sage)_12%,transparent)] text-[var(--ink)]",
    asButton && !isSelected && "hover:bg-[color:color-mix(in_oklch,var(--ink-sage)_22%,transparent)]",
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
