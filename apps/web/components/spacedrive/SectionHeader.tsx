import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  /** Render the title as a mono uppercase 10px eyebrow instead of a sans 13px label. */
  eyebrow?: boolean;
  /** Trailing action slot (e.g. a button or count). */
  action?: ReactNode;
  className?: string;
}

/**
 * Operational section header — a title cluster with an optional trailing action.
 * `eyebrow` switches the title to mono uppercase micro-type for quiet sub-sections.
 */
export function SectionHeader({
  title,
  eyebrow = false,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-6 items-center justify-between gap-3",
        className
      )}
    >
      {eyebrow ? (
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)]">
          {title}
        </span>
      ) : (
        <span className="font-[family-name:var(--font-sans)] text-[13px] font-medium text-[var(--deck-ink)]">
          {title}
        </span>
      )}
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
