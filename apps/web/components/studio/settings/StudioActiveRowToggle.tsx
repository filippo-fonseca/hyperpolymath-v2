"use client";

/**
 * StudioActiveRowToggle — the HUD affordance that swaps which amphitheater row
 * sits at the front (near, DnD-reachable) geometry.
 *
 * A quiet 36px glass button in the top-right stack, directly below the
 * window-settings trigger (same z-30 layer, below the focus overlay's z-40
 * scrim). Clicking it flips the `active-row` store; WidgetCloud re-derives its
 * slots at the new front row and each tile glides to its swapped geometry via
 * the existing damp-to-slot loop — so the back row comes forward and its zones
 * become grabbable. It is the SOLE writer of the active-row store.
 *
 * Purely a DOM control: no render-loop work, so demand-frame cannot regress. It
 * hides itself when this window owns ≤ 1 widget (the second row is empty, so
 * there is nothing to swap) — a dead toggle is worse than no toggle.
 */

import { ArrowDownUp } from "lucide-react";

import { toggleFrontRow, useFrontRow } from "@/lib/studio/state/active-row";
import { useZoneAssignment } from "@/lib/studio/state/zone-assignment";

export function StudioActiveRowToggle(): React.ReactElement | null {
  const frontRow = useFrontRow();
  const ownedCount = useZoneAssignment().length;

  // With ≤ 1 owned widget the arc is a single row — nothing to swap. Hide rather
  // than render a no-op control.
  if (ownedCount <= 1) return null;

  return (
    <div className="pointer-events-none absolute right-6 top-[4.25rem] z-30">
      <button
        type="button"
        data-studio-active-row="toggle"
        aria-label="Swap widget rows"
        aria-pressed={frontRow === 1}
        onClick={() => toggleFrontRow()}
        className="cursor-pointer-always pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 text-[#8FA8C7] shadow-[0_16px_48px_rgba(0,0,0,0.5)] transition-colors duration-100 hover:text-[#F2E9D8] aria-pressed:text-[#F2E9D8]"
      >
        <ArrowDownUp size={17} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

export default StudioActiveRowToggle;
