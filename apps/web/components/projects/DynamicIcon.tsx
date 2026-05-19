"use client";

import { CURATED_ICONS, type CuratedIconName } from "./icon-registry";

interface Props {
  name: string | null;
  size?: number;
  /**
   * UI-SPEC §8a — every Lucide icon in the app renders at strokeWidth 1.5.
   * Defaults to 1.5 so callers that omit it stay on-spec; callers may
   * override for explicit emphasis (e.g., status indicators at 2px).
   */
  strokeWidth?: number;
  className?: string;
}

/**
 * Renders a Lucide icon by name using the statically-imported curated map.
 * Returns null for unknown names (safe fallback — no runtime errors).
 * WHY static: avoids Lucide's dynamicIconImports DEV server overhead (PITFALLS Pitfall 5).
 */
export function DynamicIcon({
  name,
  size = 16,
  strokeWidth = 1.5,
  className,
}: Props) {
  if (!name) return null;
  const Icon = CURATED_ICONS[name as CuratedIconName];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}
