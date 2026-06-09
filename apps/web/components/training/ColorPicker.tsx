"use client";

import { Check } from "lucide-react";
import { TRAINING_PALETTE } from "@/lib/training/palette";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  /** Current OKLCH color string. */
  value: string;
  /** Called with the chosen OKLCH string when the user picks a swatch. */
  onChange: (oklch: string) => void;
}

/**
 * ColorPicker — curated 16-color OKLCH palette grid (Phase 15 / D-06).
 *
 * No free-hex input in v1 (RESEARCH Open Q — defer hex escape hatch). The
 * palette is the single source of truth (`lib/training/palette.ts`); changing
 * the palette there changes every consumer.
 *
 * Rendered as a 4×4 grid of 24px circular swatches. The currently-selected
 * swatch shows a foreground ring + an inner Check glyph for high-contrast
 * confirmation regardless of the swatch hue. Hovering reveals a Tooltip with
 * the palette entry name (so the user can talk about "Ember" not "the red one").
 */
export function ColorPicker({ value, onChange }: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="radiogroup"
        aria-label="Activity color"
        className="grid grid-cols-4 gap-1.5"
      >
        {TRAINING_PALETTE.map((entry) => {
          const isSelected = entry.oklch === value;
          return (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={entry.name}
                  onClick={() => onChange(entry.oklch)}
                  className={cn(
                    "relative flex h-6 w-6 items-center justify-center rounded-full transition-transform",
                    "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-raised)]",
                    isSelected &&
                      "ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--surface-raised)]",
                  )}
                  style={{ backgroundColor: entry.oklch }}
                >
                  {isSelected ? (
                    <Check
                      size={12}
                      strokeWidth={2.5}
                      className="text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]"
                    />
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {entry.name}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
