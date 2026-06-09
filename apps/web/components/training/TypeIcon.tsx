"use client";

import { getTrainingIcon } from "@/lib/training/icons";

interface Props {
  /** lucide icon id stored on the type row (e.g. "dumbbell"). */
  name: string | null | undefined;
  /** Tailwind sizing — controls the lucide `size` prop in px. */
  size?: number;
  className?: string;
  /** Optional foreground color (defaults to currentColor). */
  color?: string;
}

/**
 * Renders a training icon by stored id. Returns null when the id is empty
 * or unknown — callers can fall back to the color swatch.
 */
export function TypeIcon({ name, size = 14, className, color }: Props) {
  const Icon = getTrainingIcon(name);
  if (!Icon) return null;
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      className={className}
      color={color}
      aria-hidden
    />
  );
}
