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
        "pointer-events-none inline-flex h-9 w-fit max-w-[280px] items-center gap-2 rounded-full border border-[var(--edge-strong)] bg-[var(--sd-box)] px-3 font-sans text-meta text-[var(--ink)]",
        "shadow-[var(--shadow-pop)]",
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
        <span className="shrink-0 rounded-full bg-[var(--sd-accent)] px-2 py-0.5 font-sans text-micro font-semibold text-white">
          {count}
        </span>
      ) : null}
    </div>
  );
}
