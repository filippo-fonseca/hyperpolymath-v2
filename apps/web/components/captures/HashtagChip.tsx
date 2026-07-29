"use client";

import { tintFor } from "@/lib/tint";
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
    "inline-flex items-center font-mono text-xs font-normal rounded-md px-2 py-0.5",
    "transition-colors duration-100 ease-out",
    // jul-29 craft restyle: each tag owns a deterministic pastel from the
    // craft tint family (same tag → same hue everywhere) instead of the
    // one-sage-fits-all ladder. Selection deepens the fill with the edge hue.
    tintFor(displayName.toLowerCase()),
    isSelected
      ? "bg-[color-mix(in_srgb,var(--tint-edge)_38%,var(--tint-bg))] text-[var(--tint-ink)]"
      : isNew
        ? "bg-[var(--tint-bg)] text-[var(--tint-ink)] italic"
        : "bg-[var(--tint-bg)] text-[var(--tint-ink)]",
    asButton &&
      !isSelected &&
      "hover:bg-[color-mix(in_srgb,var(--tint-edge)_20%,var(--tint-bg))]",
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
