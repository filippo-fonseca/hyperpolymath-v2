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
                "flex h-7 w-7 items-center justify-center rounded-md border text-[var(--ink-muted)] transition-colors",
                "hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                value == null
                  ? "border-[var(--ink)] bg-[var(--surface-raised)] text-[var(--ink)]"
                  : "border-[var(--edge)] bg-[var(--surface)]",
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
                      ? "border-[var(--ink)] bg-[var(--surface-raised)] text-[var(--ink)]"
                      : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
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
