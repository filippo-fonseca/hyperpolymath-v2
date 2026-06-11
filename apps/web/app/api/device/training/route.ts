import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { trainingActivities, trainingActivityTypes } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["planned", "done", "cancelled", "skipped"] as const;
type Status = (typeof STATUSES)[number];

function bad(error: string): Response {
  return Response.json({ error }, { status: 400, headers: CORS });
}

/**
 * Paired-device CRUD for training — bearer-auth twin of
 * app/actions/training.ts (activities only; batches/types are managed on
 * web). scheduledDate is a plain YYYY-MM-DD user-local day; status "done"
 * stamps completedAt, leaving it clears the stamp; dayOrderIndex appends.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  const types = await db
    .select({
      id: trainingActivityTypes.id,
      name: trainingActivityTypes.name,
      color: trainingActivityTypes.color,
      icon: trainingActivityTypes.icon,
      hasDistance: trainingActivityTypes.hasDistance,
    })
    .from(trainingActivityTypes)
    .where(and(eq(trainingActivityTypes.userId, userId), isNull(trainingActivityTypes.archivedAt)))
    .orderBy(asc(trainingActivityTypes.orderIndex));

  let activities: unknown[] = [];
  if (start && end && DATE_RE.test(start) && DATE_RE.test(end)) {
    activities = await db
      .select({
        id: trainingActivities.id,
        activityTypeId: trainingActivities.activityTypeId,
        scheduledDate: trainingActivities.scheduledDate,
        title: trainingActivities.title,
        description: trainingActivities.description,
        plannedDurationMin: trainingActivities.plannedDurationMin,
        actualDurationMin: trainingActivities.actualDurationMin,
        plannedDistanceKm: trainingActivities.plannedDistanceKm,
        actualDistanceKm: trainingActivities.actualDistanceKm,
        status: trainingActivities.status,
        dayOrderIndex: trainingActivities.dayOrderIndex,
      })
      .from(trainingActivities)
      .where(
        and(
          eq(trainingActivities.userId, userId),
          gte(trainingActivities.scheduledDate, start),
          lte(trainingActivities.scheduledDate, end),
        ),
      )
      .orderBy(asc(trainingActivities.scheduledDate), asc(trainingActivities.dayOrderIndex));
  }

  return Response.json({ types, activities }, { headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    activityTypeId?: string;
    scheduledDate?: string;
    title?: string;
    plannedDurationMin?: number | null;
    plannedDistanceKm?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return bad("Title required");
  if (typeof body.activityTypeId !== "string") return bad("activityTypeId required");
  if (typeof body.scheduledDate !== "string" || !DATE_RE.test(body.scheduledDate)) {
    return bad("scheduledDate (YYYY-MM-DD) required");
  }

  const [type] = await db
    .select({ id: trainingActivityTypes.id })
    .from(trainingActivityTypes)
    .where(
      and(
        eq(trainingActivityTypes.id, body.activityTypeId),
        eq(trainingActivityTypes.userId, userId),
      ),
    );
  if (!type) return bad("Activity type not found");

  const [{ maxPos }] = await db
    .select({
      maxPos: sql<number>`COALESCE(MAX(${trainingActivities.dayOrderIndex}), -1)`,
    })
    .from(trainingActivities)
    .where(
      and(
        eq(trainingActivities.userId, userId),
        eq(trainingActivities.scheduledDate, body.scheduledDate),
      ),
    );

  const id = crypto.randomUUID();
  await db.insert(trainingActivities).values({
    id,
    userId,
    activityTypeId: body.activityTypeId,
    scheduledDate: body.scheduledDate,
    title,
    plannedDurationMin:
      typeof body.plannedDurationMin === "number" && body.plannedDurationMin > 0
        ? Math.min(Math.round(body.plannedDurationMin), 1440)
        : null,
    plannedDistanceKm:
      typeof body.plannedDistanceKm === "number" && body.plannedDistanceKm >= 0
        ? Math.min(body.plannedDistanceKm, 1000).toString()
        : null,
    dayOrderIndex: maxPos + 1,
  });
  return Response.json({ id }, { headers: CORS });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    id?: string;
    activityTypeId?: string;
    title?: string;
    scheduledDate?: string;
    status?: Status;
    plannedDurationMin?: number | null;
    actualDurationMin?: number | null;
    plannedDistanceKm?: number | null;
    actualDistanceKm?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (typeof body.id !== "string") return bad("id required");

  if (typeof body.activityTypeId === "string") {
    const [type] = await db
      .select({ id: trainingActivityTypes.id })
      .from(trainingActivityTypes)
      .where(
        and(
          eq(trainingActivityTypes.id, body.activityTypeId),
          eq(trainingActivityTypes.userId, userId),
        ),
      );
    if (!type) return bad("Activity type not found");
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.activityTypeId === "string") set.activityTypeId = body.activityTypeId;
  if (typeof body.title === "string" && body.title.trim()) set.title = body.title.trim().slice(0, 200);
  if (typeof body.scheduledDate === "string" && DATE_RE.test(body.scheduledDate)) {
    set.scheduledDate = body.scheduledDate;
  }
  if (STATUSES.includes(body.status as Status)) {
    set.status = body.status;
    // Mirror web setActivityStatus: 'done' stamps completedAt, others clear it.
    set.completedAt = body.status === "done" ? new Date() : null;
  }
  for (const k of ["plannedDurationMin", "actualDurationMin"] as const) {
    if (body[k] !== undefined) {
      set[k] =
        typeof body[k] === "number" && (body[k] as number) > 0
          ? Math.min(Math.round(body[k] as number), 1440)
          : null;
    }
  }
  for (const k of ["plannedDistanceKm", "actualDistanceKm"] as const) {
    if (body[k] !== undefined) {
      set[k] =
        typeof body[k] === "number" && (body[k] as number) >= 0
          ? Math.min(body[k] as number, 1000).toString()
          : null;
    }
  }

  await db
    .update(trainingActivities)
    .set(set)
    .where(and(eq(trainingActivities.id, body.id), eq(trainingActivities.userId, userId)));
  return Response.json({ ok: true }, { headers: CORS });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  await db
    .delete(trainingActivities)
    .where(and(eq(trainingActivities.id, id), eq(trainingActivities.userId, userId)));
  return Response.json({ ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
