"use client";

import { useMemo } from "react";
import { RecentCapturesWidget } from "@/components/lifeos/RecentCapturesWidget";
import { useStudioData } from "@/components/studio/data/useStudioData";
import { useStudioCaptures, useStudioProjects } from "@/components/studio/data/hooks";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { isProjectExpired } from "@/lib/projects/archive-status";

/**
 * CapturesFocus — thin adapter around the real `RecentCapturesWidget`.
 *
 * Shares the captures query cache (same key/fn), so the overlay stream stays in
 * lockstep with the 2D app. Projects come from the studio projects slice so
 * convert-to-task can link a project without leaving Studio.
 */
export function CapturesFocus(): React.ReactElement {
  const { userId } = useStudioData();
  const { captures } = useStudioCaptures();
  const { projects } = useStudioProjects();

  const availableProjects = useMemo<ProjectMultiSelectOption[]>(
    () =>
      projects
        .filter((p) => p.archivedAt === null && !isProjectExpired(p))
        .map((p) => ({
          id: p.id,
          name: p.name,
          isClass: p.isClass,
          courseCode: p.courseCode ?? null,
        })),
    [projects],
  );

  return (
    <RecentCapturesWidget
      userId={userId}
      initialCaptures={captures}
      availableProjects={availableProjects}
    />
  );
}

export default CapturesFocus;
