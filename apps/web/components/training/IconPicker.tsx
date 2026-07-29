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
              // Craft swatch: unselected is a flat recessed tile, selected
              // lifts onto the raised plate with a stronger rim.
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border text-[var(--sd-ink-dull)]",
                "transition-[background-color,border-color,color,box-shadow] duration-[160ms] ease-out",
                "hover:text-[var(--sd-ink)]",
                value == null
                  ? "border-[var(--edge-strong)] bg-[var(--surface-raised)] text-[var(--sd-ink)] shadow-[var(--shadow-card)]"
                  : "border-[var(--edge)] bg-[var(--surface)] hover:border-[var(--edge-strong)]",
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
                    "flex size-7 items-center justify-center rounded-lg border",
                    "transition-[background-color,border-color,color,box-shadow] duration-[160ms] ease-out",
                    selected
                      ? "border-[var(--edge-strong)] bg-[var(--surface-raised)] text-[var(--sd-ink)] shadow-[var(--shadow-card)]"
                      : "border-[var(--edge)] bg-[var(--surface)] text-[var(--sd-ink-dull)] hover:border-[var(--edge-strong)] hover:text-[var(--sd-ink)]",
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
