import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { tasks, tasksProjects } from "@/lib/db/schema";
import { getSidebarTree } from "@/lib/db/queries/sidebar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Paired-device read-only Areas → Projects tree (active items only), each
 * project annotated with its count of open (non-"lesno") tasks. Read surface
 * for the mobile project browser — mutations stay on web/Server Actions.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  const tree = await getSidebarTree(userId);
  const projectIds = tree.flatMap((a) => a.projects.map((p) => p.id));

  const openByProject = new Map<string, number>();
  if (projectIds.length > 0) {
    const counts = await db
      .select({
        projectId: tasksProjects.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(tasksProjects)
      .innerJoin(tasks, eq(tasks.id, tasksProjects.taskId))
      .where(
        and(
          eq(tasksProjects.userId, userId),
          inArray(tasksProjects.projectId, projectIds),
          ne(tasks.status, "lesno"),
        ),
      )
      .groupBy(tasksProjects.projectId);
    for (const row of counts) openByProject.set(row.projectId, row.count);
  }

  const areas = tree.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    projects: a.projects.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      isClass: p.isClass,
      openTaskCount: openByProject.get(p.id) ?? 0,
    })),
  }));

  return Response.json({ areas }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
