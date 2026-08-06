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
    // aug-04 craft-ui-v2: segmented chips, not a boxed segment control. Each
    // option is a .craft-chip pill; the active one fills via aria-pressed.
    <fieldset className={cn("flex items-center gap-1 font-sans", className)}>
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
      className="craft-chip cursor-pointer"
    >
      {children}
    </button>
  );
}
