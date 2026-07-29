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
        "pointer-events-none absolute z-20 rounded border border-[var(--sd-accent)] bg-[color-mix(in_srgb,var(--sd-accent)_20%,transparent)]",
        className
      )}
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        width,
        height,
      }}
    />
  );
}
