"use client";

import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { type OptimisticAction, optimisticReducer } from "@/lib/realtime/optimistic-reducer";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { useOptimistic } from "react";
import { ProjectCapturesSection } from "./ProjectCapturesSection";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTasksSection } from "./ProjectTasksSection";

type ProjectRow = Awaited<ReturnType<typeof getProjectsForCurrentUser>>[number];

export type ProjectOptimisticDispatch = (action: OptimisticAction<ProjectRow>) => void;

interface Props {
  userId: string;
  projectId: string;
  initialProjects: ProjectRow[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureWithLinks[];
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
  hashtagsForComposer,
  activeProjectsForComposer,
  graduationYear,
  area,
  allAreas,
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
    optimisticReducer<ProjectRow>
  );
  const liveProject = optimisticArray[0];

  // Guard for mid-session deletes (server-side notFound() catches the initial
  // case; this catches the race where the row is deleted while this page is open).
  if (!liveProject) return null;

  const semesterTerm = liveProject.semesterTerm as "fall" | "spring" | "summer" | null;

  return (
    // Notion-document register. Banner sits flush at top via ProjectHeader.
    // Body is a single centered measure (max-w-[1080px]) of stacked sections
    // with hairline dividers — no card chrome, no neumorphic shadows; depth
    // comes from edge contrast + restraint, matching the journal aesthetic.
    <div className="flex flex-col min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      {/* Breadcrumb strip — sits flush at the top above the banner so the
          user always sees Areas → {area} → {project} from inside the
          project. Live-bound to `liveProject.name` so renames refresh
          here without a navigation. */}
      <div className="mx-auto w-full max-w-[1080px] px-8 md:px-12 pt-4 pb-6">
        <Breadcrumbs
          items={[
            { label: "Areas", href: "/areas" },
            {
              label: area.name,
              href: `/areas/${area.id}`,
              glyph: area.emoji ?? undefined,
            },
            { label: liveProject.name },
          ]}
        />
      </div>
      <ProjectHeader
        project={{
          id: liveProject.id,
          name: liveProject.name,
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
        area={area}
        allAreas={allAreas}
      />

      <div className="mx-auto w-full max-w-[1080px] px-8 md:px-12 pb-24 pt-2 flex flex-col gap-12">
        <ProjectTasksSection
          userId={userId}
          projectId={projectId}
          projects={activeProjectsForComposer}
          areas={allAreas}
          initialTasks={initialTasks}
        />

        <div
          aria-hidden="true"
          className="h-px w-full"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--edge) 20%, var(--edge) 80%, transparent)",
          }}
        />

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
      </div>
    </div>
  );
}
