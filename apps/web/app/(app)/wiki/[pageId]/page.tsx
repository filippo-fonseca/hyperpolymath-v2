import { PageDetailClient } from "@/components/pages/PageDetailClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { getPageById } from "@/lib/db/queries/pages";
import { areas, projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ pageId: string }>;
}

/**
 * /wiki/[pageId] — Wiki document detail editor/viewer.
 * Server Component: auth, fetch page, fetch active projects list for link picker.
 */
export default async function PageDetailPage({ params }: Props) {
  const { pageId } = await params;
  const user = await requireOnboarded();

  const [page, activeProjects] = await Promise.all([
    getPageById(user.id, pageId),
    db
      .select({
        id: projects.id,
        name: projects.name,
        icon: projects.icon,
        isClass: projects.isClass,
        courseCode: projects.courseCode,
        areaName: areas.name,
        areaEmoji: areas.emoji,
      })
      .from(projects)
      .leftJoin(areas, eq(projects.areaId, areas.id))
      .where(and(eq(projects.userId, user.id), isNull(projects.archivedAt))),
  ]);

  if (!page) notFound();

  return <PageDetailClient userId={user.id} page={page} initialActiveProjects={activeProjects} />;
}
