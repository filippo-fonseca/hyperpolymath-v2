import type { ReactNode } from "react";

/**
 * LifeOsAreasShell — the scroll container for the Areas view inside
 * LifeOsCanvas. The canvas owns the flip animation and the section header /
 * "open full view" shortcut now rides the toggle row, so this shell is purely
 * the fixed-height, internally-scrolling frame the tree lives in.
 *
 * A full areas tree can't be forced to one screen (UI-CONTRACT-SD3 seed §3),
 * so it keeps its own `overflow-y-auto` within the fixed region. `h-full`
 * resolves against the canvas swap region (already `flex-1 min-h-0`).
 */
export function LifeOsAreasShell({ children }: { children: ReactNode }) {
  return (
    <div className="sd-scroll-hover h-full min-h-0 overflow-y-auto pb-2">{children}</div>
  );
}
