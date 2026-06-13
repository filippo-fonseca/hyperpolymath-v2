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
 * Renders a project/area icon by stored value. A value present in the curated
 * map renders as that Lucide icon; any other non-empty value is treated as an
 * emoji string and rendered as text sized to match.
 * WHY static map: avoids Lucide's dynamicIconImports DEV server overhead (PITFALLS Pitfall 5).
 */
export function DynamicIcon({ name, size = 16, strokeWidth = 1.5, className }: Props) {
  if (!name) return null;
  const Icon = CURATED_ICONS[name as CuratedIconName];
  if (Icon) {
    return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
  }
  return (
    <span
      aria-hidden
      className={className}
      style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
    >
      {name}
    </span>
  );
}
