import { cn } from "@/lib/utils";

export interface HairlineDividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * A 1px hairline in `--deck-divider`. Horizontal spans full width (h-px),
 * vertical spans full height (w-px). Pure presentational separator.
 */
export function HairlineDivider({
  orientation = "horizontal",
  className,
}: HairlineDividerProps) {
  const isVertical = orientation === "vertical";
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-[var(--deck-divider)]",
        isVertical ? "h-full w-px" : "h-px w-full",
        className
      )}
    />
  );
}
