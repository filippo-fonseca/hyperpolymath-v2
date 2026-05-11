"use client";

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
 * Phase 2: wraps the same CaptureComposer used by /captures (D-09 single source of truth).
 * Phase 5: replaced wholesale with the Kiwi agent UI; CommandMenu.tsx itself never changes.
 *
 * Renamed from CaptureComposerStub.tsx (Plan 02-01) so the rename is visible in git history.
 */
export function CommandMenuContent({
  hashtags,
  projects,
  onSubmitSuccess,
}: Props) {
  return (
    <CaptureComposer
      hashtags={hashtags}
      projects={projects}
      onSubmitSuccess={onSubmitSuccess}
      autoFocus
    />
  );
}
