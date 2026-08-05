"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * DockStateNote — the one loading/empty/error line for dock widgets.
 *
 * Every widget used to render its own bare `<p>` for these states, so the
 * strip's quiet moments looked unfinished and inconsistent. This is the single
 * recipe instead: a faint plate in the widget's own tint (the slot's `tint-*`
 * class supplies `--tint-bg`; `--hover` is the neutral fallback) carrying
 * text-micro ink-muted copy. Optional trailing `action` slot for states that
 * offer a way out (e.g. "Connect").
 *
 * Used by every widget under `components/dock-widgets/` AND by the
 * DockWidgetSlot error boundary, so a crashed widget degrades into the same
 * grammar as an empty one.
 */
export function DockStateNote({
  children,
  action,
  className,
}: {
  children: ReactNode;
  /** Optional trailing affordance (a small pill link, say). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-0.5 flex items-center justify-between gap-2 rounded-lg bg-[color-mix(in_srgb,var(--tint-bg,var(--hover))_60%,transparent)] px-2.5 py-1.5",
        className
      )}
    >
      <p className="min-w-0 flex-1 text-micro text-[var(--ink-muted)]">{children}</p>
      {action}
    </div>
  );
}
