import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * A quiet, centered empty state for the control deck. Muted ink, generous
 * vertical breathing room, optional icon / description / action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center px-6 py-10 text-center font-[family-name:var(--font-sans)]",
        className
      )}
    >
      {icon ? (
        <div className="mb-3 text-[var(--deck-ink-faint)]">{icon}</div>
      ) : null}
      <h2 className="max-w-md text-[13px] font-medium leading-tight text-[var(--deck-ink)]">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-[var(--deck-ink-dull)]">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5 flex items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
