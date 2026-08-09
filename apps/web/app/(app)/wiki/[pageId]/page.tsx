import { PageDetailClient } from "@/components/pages/PageDetailClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { getPageById } from "@/lib/db/queries/pages";
import { areas, projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ new?: string }>;
}

/**
 * The wiki opens a freshly created page by its client-generated id while the
 * insert is still in flight (see useExplorerActions.handleCreatePage), so a
 * miss here is usually a race, not a 404. Re-read a couple of times over ~half
 * a second before giving up; only the `?new=1` path pays this cost.
 */
async function getPageWaitingForInsert(userId: string, pageId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const page = await getPageById(userId, pageId);
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

/**
 * /wiki/[pageId] — Wiki document detail editor/viewer.
 * Server Component: auth, fetch page, fetch active projects list for link picker.
 */
export default async function PageDetailPage({ params, searchParams }: Props) {
  const [{ pageId }, { new: isNew }] = await Promise.all([params, searchParams]);
  const user = await requireOnboarded();

  const [page, activeProjects] = await Promise.all([
    isNew === "1" ? getPageWaitingForInsert(user.id, pageId) : getPageById(user.id, pageId),
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
