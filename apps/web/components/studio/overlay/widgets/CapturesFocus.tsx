"use client";

import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { useStudioData } from "@/components/studio/data/useStudioData";
import { useStudioCaptures } from "@/components/studio/data/hooks";

/**
 * CapturesFocus — thin adapter around the real `RecentCapturesWidget`.
 *
 * Shares the captures query cache (same key/fn), so the overlay stream stays in
 * lockstep with the 2D app. `availableProjects: []` per the Wave-2 reconcile:
 * `StudioSeed` does not carry project options, so convert-to-task still works
 * but without project linkage (a fast-follow once the data seed widens).
 */
export function CapturesFocus(): React.ReactElement {
  const { userId } = useStudioData();
  const { captures } = useStudioCaptures();
  return (
    <RecentCapturesWidget
      userId={userId}
      initialCaptures={captures}
      availableProjects={[]}
    />
  );
}

export default CapturesFocus;
