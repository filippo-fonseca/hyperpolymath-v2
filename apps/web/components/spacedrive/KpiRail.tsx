import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface KpiRailProps {
  /** StatChips (or comparable compact metrics). */
  children?: ReactNode;
  className?: string;
}

/**
 * Compact quiet-density KPI rail — a wrapping flex row that lays out StatChips
 * with even gaps. Wraps at narrow widths so nothing clips.
 */
export function KpiRail({ children, className }: KpiRailProps) {
  return (
    <div className={cn("flex flex-wrap items-stretch gap-x-6 gap-y-3", className)}>{children}</div>
  );
}
