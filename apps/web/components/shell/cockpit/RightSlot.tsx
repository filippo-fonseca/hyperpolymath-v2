"use client";

import { SidePanelHost } from "@/components/ui/SidePanel";

/**
 * RIGHT SLOT — track three of the cockpit (SDC-1 §2.2).
 *
 * One track, two possible occupants: the Dock by default, a `SidePanel` when
 * one opens. Never both, and never a fourth column, because rail + stage + dock
 * + a detail panel starves the stage to roughly 600px on a 14-inch screen.
 *
 * The arbitration is not in here. The track's width is derived in
 * `right-slot-context` and applied to the grid root; this component only says
 * who paints inside it. `SidePanelHost` renders null when nothing is
 * registered, so an empty slot costs nothing.
 */
export function RightSlot() {
  return (
    <div className="min-w-0 overflow-hidden">
      <SidePanelHost />
    </div>
  );
}
