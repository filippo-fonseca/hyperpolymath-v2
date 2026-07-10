"use client";

import { cn } from "@/lib/utils";

export function SelectionRubberBand({
  x,
  y,
  width,
  height,
  visible = true,
  className,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  className?: string;
}) {
  if (!visible || width <= 0 || height <= 0) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-20 rounded-[6px] border border-[var(--hud-cyan)] bg-[color-mix(in_oklch,var(--hud-cyan)_18%,transparent)]",
        "shadow-[0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_24%,transparent)_inset]",
        className,
      )}
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        width,
        height,
      }}
    />
  );
}
