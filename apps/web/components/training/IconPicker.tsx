"use client";

import { Ban } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TRAINING_ICONS } from "@/lib/training/icons";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * Notion-style icon grid. First swatch clears the icon; the rest are the
 * curated lucide subset from lib/training/icons.ts.
 */
export function IconPicker({ value, onChange }: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="radiogroup"
        aria-label="Activity icon"
        className="grid grid-cols-9 gap-1"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={value == null}
              aria-label="No icon"
              onClick={() => onChange(null)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md border text-[var(--sd-ink-dull)] transition-colors",
                "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
                value == null
                  ? "border-[var(--sd-ink)] bg-[var(--sd-box)] text-[var(--sd-ink)]"
                  : "border-[var(--sd-line)] bg-[var(--sd-input)]",
              )}
            >
              <Ban size={12} strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>None</TooltipContent>
        </Tooltip>

        {TRAINING_ICONS.map(({ id, label, Icon }) => {
          const selected = value === id;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  onClick={() => onChange(id)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                    selected
                      ? "border-[var(--sd-ink)] bg-[var(--sd-box)] text-[var(--sd-ink)]"
                      : "border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] hover:border-[var(--sd-accent)]",
                  )}
                >
                  <Icon size={14} strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
