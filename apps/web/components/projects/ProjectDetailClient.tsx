"use client";

import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { PageScaffold } from "@/components/ui/PageScaffold";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { type OptimisticAction, optimisticReducer } from "@/lib/realtime/optimistic-reducer";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { useOptimistic, useState } from "react";
import { ProjectCapturesSection } from "./ProjectCapturesSection";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectPagesSection } from "./ProjectPagesSection";
import { ProjectTasksSection } from "./ProjectTasksSection";

type ProjectRow = Awaited<ReturnType<typeof getProjectsForCurrentUser>>[number];

export type ProjectOptimisticDispatch = (action: OptimisticAction<ProjectRow>) => void;

interface Props {
  userId: string;
  projectId: string;
  initialProjects: ProjectRow[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureWithLinks[];
  initialPages: PageWithProjects[];
  hashtagsForComposer: { id: string; name: string; displayName: string }[];
  activeProjectsForComposer: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    isClass: boolean;
    courseCode: string | null;
    areaName: string | null;
    areaEmoji: string | null;
  }>;
  graduationYear: number | null;
  area: { id: string; name: string; emoji: string | null };
  allAreas: { id: string; name: string; emoji: string | null }[];
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
  initialPages,
  hashtagsForComposer,
  activeProjectsForComposer,
  graduationYear,
  area,
  allAreas,
}: Props) {
  // Realtime invalidation source — any project mutation invalidates this key,
  // which re-runs `select` below.
  useTableSubscription("projects", userId);

  // Header "New task" → tasks section draft panel. A monotonic counter so
  // repeated clicks re-open the panel after it closes.
  const [newTaskRequest, setNewTaskRequest] = useState(0);

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
    optimisticReducer<ProjectRow>
  );
  const liveProject = optimisticArray[0];

  // Guard for mid-session deletes (server-side notFound() catches the initial
  // case; this catches the race where the row is deleted while this page is open).
  if (!liveProject) return null;

  const semesterTerm = liveProject.semesterTerm as "fall" | "spring" | "summer" | null;

  // Parent area, derived rather than taken straight from the server prop.
  // Moving a project to another area only changes `areaId` on the project row,
  // which is live (optimistic dispatch, then the Realtime echo), so resolving
  // the area against `allAreas` keeps the badge and the breadcrumb correct
  // without refetching the route. `area` remains the fallback for the case
  // where the project sits under an archived area, which `allAreas` omits.
  const currentArea = allAreas.find((a) => a.id === liveProject.areaId) ?? area;

  return (
    // SDC-1 register: the banner sits flush at the top via ProjectHeader, and
    // everything below shares the one PageScaffold measure so this route's
    // left edge lines up with every other route. Sections separate by rhythm
    // and a single hairline (§2.9), not gradient dividers or card chrome.
    <div className="flex flex-col min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <ProjectHeader
        project={{
          id: liveProject.id,
          name: liveProject.name,
          description: liveProject.description,
          icon: liveProject.icon,
          bannerUrl: liveProject.bannerUrl,
          areaId: liveProject.areaId,
          startDate: liveProject.startDate,
          endDate: liveProject.endDate,
          archivedAt: liveProject.archivedAt,
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
        userId={userId}
        area={currentArea}
        allAreas={allAreas}
        onNewTask={() => setNewTaskRequest((n) => n + 1)}
      >
        <PageScaffold.Section>
          <ProjectTasksSection
            userId={userId}
            projectId={projectId}
            projects={activeProjectsForComposer}
            areas={allAreas}
            initialTasks={initialTasks}
            createRequest={newTaskRequest}
          />
        </PageScaffold.Section>

        <PageScaffold.Section divided>
          <ProjectCapturesSection
            userId={userId}
            projectId={projectId}
            hashtags={hashtagsForComposer}
            projects={activeProjectsForComposer.map((p) => ({
              id: p.id,
              name: p.name,
              isClass: p.isClass,
              courseCode: p.courseCode,
            }))}
            initialCaptures={initialCaptures}
          />
        </PageScaffold.Section>

        <PageScaffold.Section divided>
          <ProjectPagesSection userId={userId} projectId={projectId} initialPages={initialPages} />
        </PageScaffold.Section>
      </ProjectHeader>
    </div>
  );
}
