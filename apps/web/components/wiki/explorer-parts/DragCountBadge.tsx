"use client";

import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import { PageIcon } from "@/components/ui/icons/PageIcon";
import { cn } from "@/lib/utils";

/**
 * Drag-overlay label with a cyan multi-select count badge. Rendered inside the
 * `<DragOverlay>` at 60% opacity per SPEC Doctrine-6.
 */
export function DragCountBadge({
  kind,
  label,
  count,
  className,
}: {
  kind: "folder" | "page";
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none inline-flex h-9 w-fit max-w-[280px] items-center gap-2 rounded-full border border-[var(--sd-accent,#2599ff)] bg-[var(--sd-box)] px-2.5 font-sans text-[0.78rem] text-[var(--ink)] shadow-[0_10px_28px_hsl(235_15%_0%_/_0.4)]",
        "opacity-60",
        className
      )}
    >
      {kind === "folder" ? (
        <FolderIcon size={22} variant="closed" />
      ) : (
        <PageIcon size={22} kind="note" />
      )}
      <span className="min-w-0 truncate">{label}</span>
      {count > 1 ? (
        <span className="shrink-0 rounded-full bg-[var(--sd-accent,#2599ff)] px-1.5 py-0.5 font-sans text-[0.7rem] font-semibold text-white">
          {count}
        </span>
      ) : null}
    </div>
  );
}
