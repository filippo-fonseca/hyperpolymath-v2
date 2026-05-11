import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getTasksForProject } from "@/lib/db/queries/tasks";
import { getCapturesForProject } from "@/lib/db/queries/captures";
import { ProjectDetailClient } from "@/components/projects/ProjectDetailClient";

interface Props {
  params: Promise<{ projectId: string }>;
}

/**
 * /projects/[projectId] — Notion-style project detail page.
 *
 * Per D-15 + D-16 + D-18 + B1 (Plan 03-02 canonical detail-page pattern):
 * - Server Component fetches project list + task list + capture list in parallel.
 * - `getProjectsForCurrentUser` hydrates the canonical `['projects', userId]`
 *   query that ProjectDetailClient consumes via `select` (B1 fix). Renaming a
 *   project from the sidebar (or any other surface) invalidates the same key
 *   and re-renders this header live.
 *
 * Per Next.js 16: params is Promise<...> — must await.
 */
export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const user = await requireOnboarded();

  // Cheap existence check — surfaces notFound() for invalid/foreign ids
  // before we pay for the full hydration fetches.
  const [single] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .limit(1);
  if (!single) notFound();

  // Hydration source for the canonical `['projects', userId]` query.
  // ProjectDetailClient uses `select` to derive the single project — Realtime
  // invalidation on `['projects', userId]` then automatically re-runs the
  // selector and re-renders the header (B1).
  const { getProjectsForCurrentUser } = await import(
    "@/app/actions/projects"
  );
  const [allProjects, tasksForProject, capturesForProject] = await Promise.all([
    getProjectsForCurrentUser(),
    getTasksForProject(user.id, projectId),
    getCapturesForProject(user.id, projectId),
  ]);

  return (
    <ProjectDetailClient
      userId={user.id}
      projectId={projectId}
      initialProjects={allProjects}
      initialTasks={tasksForProject}
      initialCaptures={capturesForProject}
      graduationYear={user.graduationYear}
    />
  );
}
