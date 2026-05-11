import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { projects, tasksProjects, capturesProjects } from "@/lib/db/schema";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { ProjectDetailColumns } from "@/components/projects/ProjectDetailColumns";

interface Props {
  params: Promise<{ projectId: string }>;
}

/**
 * /projects/[projectId] — Notion-style project detail page.
 *
 * Per D-15 + D-16 + D-18 (Server Component shell + Client island):
 * - Server Component fetches project + count queries
 * - ProjectHeader is a Client Component island (inline name edit, banner change, class edit modal)
 * - ProjectDetailColumns is a stub (Plans 03 + 04 wire real task/capture lists)
 *
 * Per Next.js 16: params is Promise<...> — must await.
 */
export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const user = await requireOnboarded();

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .limit(1);

  if (!project) notFound();

  // Count linked tasks (junction — tasks_projects)
  const [{ taskCount }] = await db
    .select({ taskCount: sql<number>`COUNT(*)::int` })
    .from(tasksProjects)
    .where(
      and(
        eq(tasksProjects.projectId, projectId),
        eq(tasksProjects.userId, user.id),
      ),
    );

  // Count linked captures (junction — captures_projects)
  const [{ captureCount }] = await db
    .select({ captureCount: sql<number>`COUNT(*)::int` })
    .from(capturesProjects)
    .where(
      and(
        eq(capturesProjects.projectId, projectId),
        eq(capturesProjects.userId, user.id),
      ),
    );

  // Normalize semesterTerm to the typed union expected by ProjectHeader
  const semesterTerm = project.semesterTerm as
    | "fall"
    | "spring"
    | "summer"
    | null;

  return (
    <div className="flex flex-col min-h-full">
      <ProjectHeader
        project={{
          id: project.id,
          name: project.name,
          icon: project.icon,
          bannerUrl: project.bannerUrl,
          isClass: project.isClass,
          courseCode: project.courseCode,
          courseTitle: project.courseTitle,
          instructor: project.instructor,
          grade: project.grade,
          credits: project.credits,
          distributionals: project.distributionals,
          semesterTerm,
          semesterYear: project.semesterYear,
        }}
        graduationYear={user.graduationYear}
      />
      <div className="px-8 py-6">
        <ProjectDetailColumns
          projectId={projectId}
          taskCount={taskCount}
          captureCount={captureCount}
        />
      </div>
    </div>
  );
}
