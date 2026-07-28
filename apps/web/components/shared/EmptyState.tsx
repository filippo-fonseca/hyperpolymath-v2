"use client";

import { EmptyState as UiEmptyState } from "@/components/ui/EmptyState";

/**
 * Compatibility shim (jul-28 / U0 C3).
 *
 * The one empty state now lives at `components/ui/EmptyState.tsx` (SDC-1
 * §2.10). This file keeps its old `heading` / `body` prop names so the nine
 * call sites that import it compile unchanged; the serif, the 24px heading and
 * the primary-filled action are gone, because they were the register SDC-1
 * retires. It maps onto `size="page"`, which is the `py-24` breathing room this
 * component always had.
 *
 * New code imports `@/components/ui/EmptyState` directly. This shim exists for
 * one release; when the nine call sites have moved, delete it.
 */
interface Props {
  heading: string;
  body: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ heading, body, action, className }: Props) {
  return (
    <UiEmptyState
      size="page"
      title={heading}
      description={body}
      action={action}
      className={className}
    />
  );
}
