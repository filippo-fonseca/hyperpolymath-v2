"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

export type ExplorerSortValue = "manual" | "name" | "updated" | "created";

const sortLabels: Record<ExplorerSortValue, string> = {
  manual: "Manual",
  name: "Name",
  updated: "Updated",
  created: "Created",
};

export function SortSelect({
  value,
  onValueChange,
  className,
}: {
  value: ExplorerSortValue;
  onValueChange: (value: ExplorerSortValue) => void;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as ExplorerSortValue)}
    >
      <SelectPrimitive.Trigger
        aria-label="Sort"
        // aug-04 craft-ui-v2: the sort control is a rest-state craft chip.
        className={cn("craft-chip cursor-pointer font-sans outline-none", className)}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={14} strokeWidth={1.8} className="text-[var(--ink-muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          align="end"
          sideOffset={6}
          className={cn(
            // aug-04 craft-ui-v2: frosted menu surface (craft-glass-pop owns
            // fill, edge, radius, and the pop shadow in both themes).
            "craft-glass-pop z-50 min-w-[132px] overflow-hidden p-1 font-sans text-meta text-[var(--ink)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1"
          )}
        >
          <SelectPrimitive.Viewport>
            {(Object.keys(sortLabels) as ExplorerSortValue[]).map((option) => (
              <SelectPrimitive.Item
                key={option}
                value={option}
                className="relative flex h-7 select-none items-center rounded px-2 pr-7 outline-none transition-colors duration-[160ms] ease-out focus:bg-[var(--sd-menu-hover)] data-[state=checked]:text-[var(--sd-accent)]"
              >
                <SelectPrimitive.ItemText>{sortLabels[option]}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Check size={13} strokeWidth={2} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
