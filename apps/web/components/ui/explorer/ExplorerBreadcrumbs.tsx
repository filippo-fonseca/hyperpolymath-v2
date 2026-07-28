"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

type SegmentButtonProps = ComponentPropsWithoutRef<"button"> & {
  ref?: Ref<HTMLButtonElement>;
};

export type ExplorerBreadcrumbSegment = {
  id: string;
  label: string;
  current?: boolean;
  buttonProps?: SegmentButtonProps;
};

export function ExplorerBreadcrumbs({
  segments,
  renderSegment,
  className,
}: {
  segments: ExplorerBreadcrumbSegment[];
  renderSegment?: (segment: ExplorerBreadcrumbSegment, defaultNode: ReactNode) => ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label="Explorer breadcrumbs" className={cn("min-w-0 font-sans", className)}>
      <ol className="flex min-w-0 items-center gap-1 overflow-hidden">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1 || segment.current;
          const defaultNode = (
            <button
              type="button"
              aria-current={isLast ? "page" : undefined}
              {...segment.buttonProps}
              className={cn(
                "min-w-0 truncate rounded-lg px-2 py-1 text-meta",
                "transition-[background-color,color] duration-[160ms] ease-out",
                isLast
                  ? "pointer-events-none text-[var(--ink)]"
                  : "text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] focus-visible:bg-[var(--sd-hover)] focus-visible:text-[var(--sd-ink)]",
                segment.buttonProps?.className
              )}
            >
              {segment.label}
            </button>
          );

          return (
            <li key={segment.id} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  size={13}
                  strokeWidth={1.7}
                  className="shrink-0 text-[color-mix(in_oklch,var(--ink-muted)_70%,transparent)]"
                />
              ) : null}
              {renderSegment ? renderSegment(segment, defaultNode) : defaultNode}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
