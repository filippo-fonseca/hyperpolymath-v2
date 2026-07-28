"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

export type ExplorerSortValue = "manual" | "name" | "updated";

const sortLabels: Record<ExplorerSortValue, string> = {
  manual: "Manual",
  name: "Name",
  updated: "Updated",
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
        className={cn(
          "flex h-8 min-w-[116px] items-center justify-between gap-2 rounded-lg bg-[var(--sd-box)] px-3 font-sans text-meta text-[var(--ink)] outline-none",
          "transition-[background-color,border-color] duration-[160ms] ease-out",
          "hover:bg-[var(--sd-hover)]",
          className
        )}
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
            "z-50 min-w-[132px] overflow-hidden rounded-xl border border-[var(--sd-line)] bg-[var(--sd-menu)] p-1 font-sans text-meta text-[var(--ink)]",
            "shadow-[0_4px_16px_rgb(0_0_0_/_0.06)] dark:shadow-[0_4px_16px_rgb(0_0_0_/_0.30)]",
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
