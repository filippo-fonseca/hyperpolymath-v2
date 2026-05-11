"use client";

import { CURATED_ICONS, type CuratedIconName } from "./icon-registry";

interface Props {
  name: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders a Lucide icon by name using the statically-imported curated map.
 * Returns null for unknown names (safe fallback — no runtime errors).
 * WHY static: avoids Lucide's dynamicIconImports DEV server overhead (PITFALLS Pitfall 5).
 */
export function DynamicIcon({ name, size = 16, className }: Props) {
  if (!name) return null;
  const Icon = CURATED_ICONS[name as CuratedIconName];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
