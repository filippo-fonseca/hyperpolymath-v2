"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseBanner } from "@/lib/utils/banner";
import { cn } from "@/lib/utils";

const BANNER_OPTIONS: { name: string; value: string; type: "solid" | "gradient" }[] = [
  // Solids — muted earth tones (UI-SPEC §Banner Picker)
  { name: "Parchment", type: "solid", value: "solid:hsl(42, 18%, 97%)" },
  { name: "Warm Linen", type: "solid", value: "solid:hsl(30, 20%, 82%)" },
  { name: "Old Gold", type: "solid", value: "solid:hsl(38, 35%, 72%)" },
  { name: "Terra Cotta", type: "solid", value: "solid:hsl(25, 40%, 60%)" },
  { name: "Slate Blue", type: "solid", value: "solid:hsl(200, 20%, 65%)" },
  { name: "Sage", type: "solid", value: "solid:hsl(155, 18%, 60%)" },
  { name: "Lavender Grey", type: "solid", value: "solid:hsl(300, 10%, 65%)" },
  { name: "Sepia Dark", type: "solid", value: "solid:hsl(30, 8%, 35%)" },
  // Gradients — Renaissance fresco-inspired (UI-SPEC §Banner Picker)
  {
    name: "Fresco Amber",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(42, 60%, 88%) 0%, hsl(25, 50%, 78%) 100%)",
  },
  {
    name: "Venetian Blue",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(195, 35%, 80%) 0%, hsl(215, 30%, 70%) 100%)",
  },
  {
    name: "Verdigris",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(155, 25%, 78%) 0%, hsl(180, 20%, 68%) 100%)",
  },
  {
    name: "Byzantine Purple",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(280, 20%, 80%) 0%, hsl(310, 15%, 72%) 100%)",
  },
  {
    name: "Sienna Gold",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(30, 40%, 85%) 0%, hsl(50, 35%, 78%) 100%)",
  },
  {
    name: "Pompeian Rose",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(0, 25%, 82%) 0%, hsl(20, 30%, 74%) 100%)",
  },
  {
    name: "Ash Stone",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(220, 15%, 75%) 0%, hsl(240, 12%, 68%) 100%)",
  },
  {
    name: "Paper Sage",
    type: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(42, 18%, 92%) 0%, hsl(155, 12%, 85%) 100%)",
  },
];

interface Props {
  value: string | null;
  onChange: (bannerValue: string | null) => void;
}

/**
 * Banner picker — 16-swatch grid (8 solids + 8 gradients per UI-SPEC §Banner Picker).
 * Each swatch is 64px × 40px, rounded-md.
 * Selected: ring-2 ring-ring ring-offset-1.
 * aria-label: "[Color name] banner".
 */
export function BannerPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const currentBg = parseBanner(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick banner color"
          className={cn(
            "h-9 w-20 rounded-md border border-input",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "transition-opacity hover:opacity-90",
          )}
          style={{ background: currentBg }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start" sideOffset={4}>
        <p className="font-sans text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
          Solids
        </p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {BANNER_OPTIONS.filter((o) => o.type === "solid").map((option) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-label={`${option.name} banner`}
                title={option.name}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "h-10 w-full rounded-md transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected && "ring-2 ring-ring ring-offset-1",
                )}
                style={{ background: parseBanner(option.value) }}
              />
            );
          })}
        </div>

        <p className="font-sans text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
          Gradients
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {BANNER_OPTIONS.filter((o) => o.type === "gradient").map((option) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-label={`${option.name} banner`}
                title={option.name}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "h-10 w-full rounded-md transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected && "ring-2 ring-ring ring-offset-1",
                )}
                style={{ background: parseBanner(option.value) }}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
