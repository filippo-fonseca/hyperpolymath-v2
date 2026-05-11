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
 * Hashtag chip pill per UI-SPEC §Hashtag Chips.
 *
 * Variants (background/foreground):
 * - default:  warm tan (hsl(38, 40%, 88%)) on foreground
 * - selected: accent / accent-foreground (sidebar active state — color shift, weight stays 400)
 * - new:      cool blue (hsl(215, 40%, 90%)) on dark blue text + italic "(new)" suffix
 *
 * Use `asButton={false}` for purely visual chips inside capture text bodies (no click target).
 */
export function HashtagChip({
  displayName,
  isSelected,
  isNew,
  onClick,
  asButton = true,
}: Props) {
  const style = isSelected
    ? {
        backgroundColor: "var(--color-accent)",
        color: "var(--color-accent-foreground)",
      }
    : isNew
      ? { backgroundColor: "hsl(215, 40%, 90%)", color: "hsl(215, 60%, 30%)" }
      : {
          backgroundColor: "hsl(38, 40%, 88%)",
          color: "var(--color-foreground)",
        };

  const className = cn(
    "inline-flex items-center font-sans text-[13px] font-normal rounded-md px-2 py-1",
    asButton && "cursor-pointer hover:opacity-80 transition-opacity",
  );

  const content = (
    <>
      #{displayName}
      {isNew ? <span className="italic ml-1">(new)</span> : null}
    </>
  );

  if (!asButton) {
    return (
      <span className={className} style={style}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={style}
    >
      {content}
    </button>
  );
}
