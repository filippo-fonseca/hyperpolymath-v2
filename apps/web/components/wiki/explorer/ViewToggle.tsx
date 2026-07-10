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
    <div
      role="group"
      aria-label="View mode"
      className={cn("flex h-8 items-center rounded-full border border-[var(--sd-line)] bg-[var(--sd-box)] p-0.5 font-sans", className)}
    >
      <ViewToggleButton label="Grid" active={value === "grid"} onClick={() => onChange("grid")}>
        <Grid2X2 size={14} strokeWidth={1.8} />
      </ViewToggleButton>
      <ViewToggleButton label="List" active={value === "list"} onClick={() => onChange("list")}>
        <List size={15} strokeWidth={1.8} />
      </ViewToggleButton>
    </div>
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
        "flex h-7 min-w-8 items-center justify-center rounded-full px-2 text-[var(--ink-muted)]",
        "transition-[background-color,border-color,color] duration-180 ease-out",
        active && "bg-[var(--sd-selected)] text-[var(--hud-cyan)] shadow-[0_0_0_1px_var(--hud-cyan)_inset]",
        !active && "hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]",
      )}
    >
      {children}
    </button>
  );
}
