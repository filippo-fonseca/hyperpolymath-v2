import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { areas, projects, tasks, tasksProjects } from "@/lib/db/schema";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { scheduleEntityEmbedding } from "@/lib/references/embedding-enqueue";
import { deleteReferencesForTarget } from "@/lib/references/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Paired-device Areas → Projects tree (active items only), each project
 * annotated with its count of open (non-"lesno") tasks.
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

function bad(error: string): Response {
  return Response.json({ error }, { status: 400, headers: CORS });
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function cleanOptional(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max) || null;
}

async function nextAreaOrder(userId: string): Promise<number> {
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${areas.orderIndex}), -1)` })
    .from(areas)
    .where(eq(areas.userId, userId));
  return (maxOrder ?? -1) + 1;
}

async function nextProjectOrder(userId: string, areaId: string): Promise<number> {
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${projects.orderIndex}), -1)` })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.areaId, areaId)));
  return (maxOrder ?? -1) + 1;
}

async function verifyArea(userId: string, areaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId)))
    .limit(1);
  return Boolean(row);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ensureNoAreaBucket(tx: Tx, userId: string): Promise<string> {
  const [existing] = await tx
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.userId, userId), eq(areas.name, "No Area"), isNull(areas.emoji)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(areas)
    .values({
      userId,
      name: "No Area",
      emoji: null,
      orderIndex: 9999,
      archivedAt: null,
    })
    .returning({ id: areas.id });
  return created!.id;
}

export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    type?: "area" | "project";
    name?: unknown;
    emoji?: unknown;
    icon?: unknown;
    areaId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const name = cleanName(body.name);
  if (!name) return bad("Name required");

  if (body.type === "area") {
    const id = crypto.randomUUID();
    const emoji = cleanOptional(body.emoji, 8) ?? null;
    await db.insert(areas).values({
      id,
      userId,
      name,
      emoji,
      orderIndex: await nextAreaOrder(userId),
    });
    scheduleEntityEmbedding({ userId, entityType: "area", entityId: id });
    return Response.json({ id }, { headers: CORS });
  }

  if (body.type === "project") {
    if (typeof body.areaId !== "string") return bad("areaId required");
    if (!(await verifyArea(userId, body.areaId))) return bad("Area not found");
    const id = crypto.randomUUID();
    const icon = cleanOptional(body.icon, 50) ?? null;
    await db.insert(projects).values({
      id,
      userId,
      areaId: body.areaId,
      name,
      icon,
      orderIndex: await nextProjectOrder(userId, body.areaId),
    });
    scheduleEntityEmbedding({ userId, entityType: "project", entityId: id });
    return Response.json({ id }, { headers: CORS });
  }

  return bad("type must be area or project");
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    type?: "area" | "project";
    id?: unknown;
    name?: unknown;
    emoji?: unknown;
    icon?: unknown;
    archived?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (typeof body.id !== "string") return bad("id required");

  const archivedAt = body.archived === true ? new Date() : body.archived === false ? null : undefined;

  if (body.type === "area") {
    const set: Partial<typeof areas.$inferInsert> = { updatedAt: new Date() };
    const name = cleanName(body.name);
    if (body.name !== undefined) {
      if (!name) return bad("Name required");
      set.name = name;
    }
    const emoji = cleanOptional(body.emoji, 8);
    if (emoji !== undefined) set.emoji = emoji;
    if (archivedAt !== undefined) set.archivedAt = archivedAt;

    await db.update(areas).set(set).where(and(eq(areas.id, body.id), eq(areas.userId, userId)));
    if (set.name !== undefined) scheduleEntityEmbedding({ userId, entityType: "area", entityId: body.id });
    return Response.json({ ok: true }, { headers: CORS });
  }

  if (body.type === "project") {
    const set: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    const name = cleanName(body.name);
    if (body.name !== undefined) {
      if (!name) return bad("Name required");
      set.name = name;
    }
    const icon = cleanOptional(body.icon, 50);
    if (icon !== undefined) set.icon = icon;
    if (archivedAt !== undefined) set.archivedAt = archivedAt;

    await db.update(projects).set(set).where(and(eq(projects.id, body.id), eq(projects.userId, userId)));
    if (set.name !== undefined) {
      scheduleEntityEmbedding({ userId, entityType: "project", entityId: body.id });
    }
    return Response.json({ ok: true }, { headers: CORS });
  }

  return bad("type must be area or project");
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });
  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");

  if (type === "project") {
    await db.transaction(async (tx) => {
      await deleteReferencesForTarget(tx, { userId, targetType: "project", targetId: id });
      await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
    });
    return Response.json({ ok: true }, { headers: CORS });
  }

  if (type === "area") {
    const [victim] = await db
      .select({ id: areas.id, name: areas.name, emoji: areas.emoji })
      .from(areas)
      .where(and(eq(areas.id, id), eq(areas.userId, userId)))
      .limit(1);
    if (!victim) return bad("Area not found");
    if (victim.name === "No Area" && victim.emoji === null) {
      return bad("Can't delete the No Area bucket.");
    }

    await db.transaction(async (tx) => {
      const [{ projectCount }] = await tx
        .select({ projectCount: sql<number>`COUNT(*)::int` })
        .from(projects)
        .where(and(eq(projects.areaId, id), eq(projects.userId, userId)));
      if (projectCount > 0) {
        const sentinelId = await ensureNoAreaBucket(tx, userId);
        await tx
          .update(projects)
          .set({ areaId: sentinelId, updatedAt: new Date() })
          .where(and(eq(projects.areaId, id), eq(projects.userId, userId)));
      }
      await deleteReferencesForTarget(tx, { userId, targetType: "area", targetId: id });
      await tx.delete(areas).where(and(eq(areas.id, id), eq(areas.userId, userId)));
    });
    return Response.json({ ok: true }, { headers: CORS });
  }

  return bad("type must be area or project");
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
