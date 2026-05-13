"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

import { CaptureComposer } from "@/components/captures/CaptureComposer";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";

interface Props {
  hashtags: { id: string; name: string; displayName: string }[];
  projects: ProjectMultiSelectOption[];
  onSubmitSuccess: () => void;
}

/**
 * Slot component — the contents of the Cmd+K modal (Warning 12 — Phase 5 seam).
 *
 * Phase 2: wraps the CaptureComposer used by /captures (D-09 single source of truth).
 * Phase 3: Cmd+K mount has NO `onOptimisticInsert` prop (composer is not inside
 * CapturesClient here). Realtime echo + invalidation paints /captures within ~1s.
 * Phase 4 Plan 04-04: adds a "Calendar" affordance — "New event" — that
 * navigates to `/calendar?create=now`. CalendarClient consumes the search
 * param and opens EventDetailPanel pre-filled at the next round half-hour.
 * The deep-link approach (vs an event bus) keeps Cmd+K stateless and lets a
 * full-page transition pick up the panel even if /calendar wasn't yet
 * mounted in the current session.
 * Phase 5: replaced wholesale with the Kiwi agent UI; CommandMenu.tsx itself
 * never changes.
 */
export function CommandMenuContent({
  hashtags,
  projects,
  onSubmitSuccess,
}: Props) {
  const router = useRouter();

  const handleNewEvent = () => {
    // Deep-link approach (Plan 04-04 Task 2 Step 3 — "simpler approach
    // preferred for MVP"). CalendarClient's useEffect on `?create=now`
    // opens the panel pre-filled with the next round half-hour and a
    // 60-minute block, then strips the param via router.replace.
    onSubmitSuccess(); // close the Cmd+K dialog first
    router.push("/calendar?create=now");
  };

  return (
    <div className="flex flex-col gap-4">
      <CaptureComposer
        hashtags={hashtags}
        projects={projects}
        onSubmitSuccess={onSubmitSuccess}
        autoFocus
      />
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground px-1">
          Calendar
        </span>
        <button
          type="button"
          onClick={handleNewEvent}
          className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-[13px] font-sans hover:bg-secondary transition-colors"
        >
          <Calendar size={14} className="text-muted-foreground" />
          <span>New event</span>
          <span className="ml-auto text-xs text-muted-foreground">
            /calendar?create=now
          </span>
        </button>
      </div>
    </div>
  );
}
