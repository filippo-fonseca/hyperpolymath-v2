"use client";

import { Calendar, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createPage } from "@/app/actions/pages";
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
 *
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5f + §12e + §12f):
 *
 * Cmd+K modal sits on diplomatic-tier chrome. Composer wrapper gets the
 * doc focus-amber treatment (1px transparent border → 1px --ink-amber on
 * focus-within, 150ms transition) per UI-SPEC §9d Input register. Calendar
 * section uses mono chrome (section label + button label) per UI-SPEC §5f.
 * "New event" copy + /calendar?create=now deep-link mechanism preserved
 * per UI-SPEC §14 carry-forward.
 */
export function CommandMenuContent({ hashtags, projects, onSubmitSuccess }: Props) {
  const router = useRouter();
  const [creatingPage, setCreatingPage] = useState(false);

  const handleNewPage = async () => {
    if (creatingPage) return;
    setCreatingPage(true);
    try {
      // Client-generated UUID so the Realtime echo is a no-op for the list.
      const id = crypto.randomUUID();
      const result = await createPage({ id, title: "", content: "" });
      onSubmitSuccess(); // close the Cmd+K dialog
      if (result.success) router.push(`/wiki/${result.data.id}`);
    } finally {
      setCreatingPage(false);
    }
  };

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
      {/* UI-SPEC §9d — doc-tier input wrapper. Border becomes --ink-amber
          when any child has focus; 150ms transition matches Tasks/Captures
          composer wrappers across the app. */}
      <div className="rounded-sm border border-transparent focus-within:border-[var(--ink-amber)] transition-colors duration-150 ease-out p-2">
        <CaptureComposer
          hashtags={hashtags}
          projects={projects}
          onSubmitSuccess={onSubmitSuccess}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1 border-t border-[var(--edge)] pt-3">
        {/* Mono section label per UI-SPEC §12c chrome register */}
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] px-1">
          Calendar
        </span>
        <button
          type="button"
          onClick={handleNewEvent}
          className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-[13px] font-serif text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer-always"
        >
          <Calendar size={14} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
          <span>New event</span>
          <span className="ml-auto font-mono text-[11px] tracking-[0.04em] text-[var(--ink-muted)]">
            /calendar?create=now
          </span>
        </button>
      </div>
      <div className="flex flex-col gap-1 border-t border-[var(--edge)] pt-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] px-1">
          Wiki
        </span>
        <button
          type="button"
          onClick={handleNewPage}
          disabled={creatingPage}
          aria-busy={creatingPage}
          className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-[13px] font-serif text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer-always disabled:opacity-50 disabled:cursor-wait"
        >
          {creatingPage ? (
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-[var(--ink-muted)]" />
          ) : (
            <FileText size={14} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
          )}
          <span>{creatingPage ? "Creating…" : "New page"}</span>
          <span className="ml-auto font-mono text-[11px] tracking-[0.04em] text-[var(--ink-muted)]">
            /wiki
          </span>
        </button>
      </div>
    </div>
  );
}
