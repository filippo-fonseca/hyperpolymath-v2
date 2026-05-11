"use client";

import { useOptimistic } from "react";
import { useQuery } from "@tanstack/react-query";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectDetailColumns } from "./ProjectDetailColumns";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

type ProjectRow = Awaited<
  ReturnType<typeof getProjectsForCurrentUser>
>[number];

export type ProjectOptimisticDispatch = (
  action: OptimisticAction<ProjectRow>,
) => void;

interface Props {
  userId: string;
  projectId: string;
  initialProjects: ProjectRow[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureWithLinks[];
  graduationYear: number | null;
}

/**
 * Project detail Client island — B1 canonical detail-page pattern.
 *
 * Why this exists (B1 fix): the project header used to live as a Client
 * Component inside the Server Component page, with no React Query wiring.
 * Renaming a project from the sidebar in window A did NOT propagate to
 * window B's project detail page because that page only re-fetched on
 * router.refresh / hard navigate.
 *
 * The canonical pattern: re-use the COLLECTION query key
 * `tableKey("projects", userId)` (the same one the sidebar uses) with a
 * `select` projection that picks the single project by id. Realtime
 * invalidation on the collection key now drives both the sidebar AND
 * this header automatically.
 *
 * DO NOT use a per-id query key (e.g. a tuple keyed by the project id) —
 * Realtime callbacks invalidate by COLLECTION key only, and a per-id key
 * would never be invalidated.
 */
export function ProjectDetailClient({
  userId,
  projectId,
  initialProjects,
  initialTasks,
  initialCaptures,
  graduationYear,
}: Props) {
  // Realtime invalidation source — any project mutation invalidates this key,
  // which re-runs `select` below.
  useTableSubscription("projects", userId);

  // B1: collection key + select. Hydrated from initialProjects (SSR).
  const { data: project } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: getProjectsForCurrentUser,
    initialData: initialProjects,
    select: (rows) => rows.find((r) => r.id === projectId),
  });

  // Local optimistic state for header edits. Wrap the derived single project
  // into a single-element array so the same reducer shape works.
  const projectArray: ProjectRow[] = project ? [project] : [];
  const [optimisticArray, addOptimisticProject] = useOptimistic(
    projectArray,
    optimisticReducer<ProjectRow>,
  );
  const liveProject = optimisticArray[0];

  // Guard for mid-session deletes (server-side notFound() catches the initial
  // case; this catches the race where the row is deleted while this page is open).
  if (!liveProject) return null;

  const semesterTerm = liveProject.semesterTerm as
    | "fall"
    | "spring"
    | "summer"
    | null;

  return (
    <div className="flex flex-col min-h-full">
      <ProjectHeader
        project={{
          id: liveProject.id,
          name: liveProject.name,
          icon: liveProject.icon,
          bannerUrl: liveProject.bannerUrl,
          isClass: liveProject.isClass,
          courseCode: liveProject.courseCode,
          courseTitle: liveProject.courseTitle,
          instructor: liveProject.instructor,
          grade: liveProject.grade,
          credits: liveProject.credits,
          distributionals: liveProject.distributionals,
          semesterTerm,
          semesterYear: liveProject.semesterYear,
        }}
        graduationYear={graduationYear}
        addOptimisticProject={addOptimisticProject}
      />
      <div className="px-8 py-6">
        <ProjectDetailColumns
          projectId={projectId}
          tasks={initialTasks}
          captures={initialCaptures}
        />
      </div>
    </div>
  );
}
