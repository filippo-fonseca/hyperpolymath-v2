"use client";

import { cn } from "@/lib/utils";
import { Grid2X2, List } from "lucide-react";
import type { ReactNode } from "react";

export type ExplorerViewMode = "grid" | "list";

export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ExplorerViewMode;
  onChange: (value: ExplorerViewMode) => void;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "flex h-8 items-center overflow-hidden rounded-lg bg-[var(--sd-box)] font-sans",
        className
      )}
    >
      <legend className="sr-only">View mode</legend>
      <ViewToggleButton label="Grid" active={value === "grid"} onClick={() => onChange("grid")}>
        <Grid2X2 size={14} strokeWidth={1.8} />
      </ViewToggleButton>
      <ViewToggleButton label="List" active={value === "list"} onClick={() => onChange("list")}>
        <List size={15} strokeWidth={1.8} />
      </ViewToggleButton>
    </fieldset>
  );
}

function ViewToggleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} view`}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-full min-w-8 items-center justify-center border-r border-r-[var(--sd-line)] px-2 text-[var(--sd-ink-dull)] last:border-r-0",
        "transition-[background-color,border-color,color] duration-[160ms] ease-out",
        active && "bg-[var(--sd-selected)] text-[var(--sd-accent)]",
        !active && "hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]"
      )}
    >
      {children}
    </button>
  );
}
