"use client";

import type { ReactNode } from "react";
import { EmptyState as UiEmptyState } from "@/components/ui/EmptyState";

/**
 * Compatibility shim (jul-28 / U0 C3).
 *
 * The one empty state now lives at `components/ui/EmptyState.tsx` (SDC-1
 * §2.10). This file keeps the explorer kit's old prop names so its call sites
 * compile unchanged. The `min-h-[240px]` box maps onto `size="section"`, and
 * the free-form `action` node rides the `actionSlot` escape hatch, which exists
 * precisely because this component's action was never a single button.
 *
 * New code imports `@/components/ui/EmptyState` directly and passes a
 * `{ label, onClick }` action. This shim exists for one release.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <UiEmptyState
      size="section"
      icon={icon}
      title={title}
      description={description}
      actionSlot={action}
      className={className}
    />
  );
}
