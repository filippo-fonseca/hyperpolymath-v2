import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface CommandToolbarProps {
  /** Identity / title cluster, pinned to the leading edge. */
  leading?: ReactNode;
  /** Primary action buttons, pinned to the trailing edge. */
  children?: ReactNode;
  className?: string;
}

/**
 * Tier-1 command toolbar — the top chrome band of a deck surface. Leading
 * identity cluster on the left, primary actions on the right, a bottom hairline
 * closing it off from the content below.
 */
export function CommandToolbar({
  leading,
  children,
  className,
}: CommandToolbarProps) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 border-b border-[var(--deck-line)] bg-[var(--deck-panel)] px-3 font-[family-name:var(--font-sans)] text-[13px] text-[var(--deck-ink)]",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{leading}</div>
      {children ? (
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      ) : null}
    </div>
  );
}
