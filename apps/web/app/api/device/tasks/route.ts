import { and, eq, max } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { projects, tasks, tasksProjects } from "@/lib/db/schema";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { normalizeReminderOffsets } from "@/lib/tasks/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PRIORITIES = ["P∞", "P1", "P2", "P3"] as const;
const STATUSES = ["not started", "up next", "in progress", "almost done", "lesno"] as const;
type Priority = (typeof PRIORITIES)[number];
type Status = (typeof STATUSES)[number];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function bad(error: string): Response {
  return Response.json({ error }, { status: 400, headers: CORS });
}

async function verifyProjects(userId: string, ids: string[]): Promise<string[] | null> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, userId));
  const owned = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !owned.has(id))) return null;
  return ids;
}

/**
 * Paired-device CRUD for tasks — bearer-auth twin of app/actions/tasks.ts.
 * Mutation semantics mirror the Server Actions exactly: status "lesno" sets
 * completedAt, transitioning away clears it; kanbanPosition appends to the
 * end of the target status column; project links replace wholesale.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });
  const rows = await getAllTasksForUser(userId);
  return Response.json({ tasks: rows }, { headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    title?: string;
    notes?: string | null;
    priority?: Priority;
    status?: Status;
    dueDate?: string | null;
    dueTime?: string | null;
    reminderOffsetsMin?: number[] | null;
    projectIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  if (!title) return bad("Title required");
  const priority = PRIORITIES.includes(body.priority as Priority) ? body.priority! : "P3";
  const status = STATUSES.includes(body.status as Status) ? body.status! : "not started";
  const dueDate =
    typeof body.dueDate === "string" && DATE_RE.test(body.dueDate) ? body.dueDate : null;
  // Time-of-day rides the date: ignored when no valid dueDate came with it.
  const dueTime =
    dueDate && typeof body.dueTime === "string" && TIME_RE.test(body.dueTime)
      ? body.dueTime
      : null;
  // Reminders ride the date too: dropped when no valid dueDate came with them.
  const reminderOffsetsMin =
    dueDate && Array.isArray(body.reminderOffsetsMin)
      ? normalizeReminderOffsets(body.reminderOffsetsMin.filter((v) => typeof v === "number"))
      : [];
  const projectIds = await verifyProjects(
    userId,
    Array.isArray(body.projectIds) ? body.projectIds.slice(0, 20) : [],
  );
  if (projectIds === null) return bad("Unknown project");

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [{ maxPos }] = await tx
      .select({ maxPos: max(tasks.kanbanPosition) })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, status)));
    await tx.insert(tasks).values({
      id,
      userId,
      title,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 10000) : null,
      priority,
      status,
      dueDate,
      dueTime,
      reminderOffsetsMin,
      kanbanPosition: (maxPos ?? -1) + 1,
      completedAt: status === "lesno" ? new Date() : null,
    });
    if (projectIds.length > 0) {
      await tx
        .insert(tasksProjects)
        .values(projectIds.map((pid) => ({ taskId: id, projectId: pid, userId })));
    }
  });
  return Response.json({ id }, { headers: CORS });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    id?: string;
    title?: string;
    notes?: string | null;
    priority?: Priority;
    status?: Status;
    dueDate?: string | null;
    dueTime?: string | null;
    reminderOffsetsMin?: number[] | null;
    projectIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (typeof body.id !== "string") return bad("id required");

  const existing = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.id, body.id), eq(tasks.userId, userId)))
    .limit(1);
  if (!existing[0]) return bad("Not found");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string" && body.title.trim()) set.title = body.title.trim().slice(0, 500);
  if (body.notes !== undefined) set.notes = body.notes ? String(body.notes).slice(0, 10000) : null;
  if (PRIORITIES.includes(body.priority as Priority)) set.priority = body.priority;
  if (STATUSES.includes(body.status as Status)) {
    set.status = body.status;
    if (body.status === "lesno" && existing[0].status !== "lesno") {
      set.completedAt = new Date();
    } else if (body.status !== "lesno" && existing[0].status === "lesno") {
      set.completedAt = null;
    }
    // Parity with updateTaskStatus: a card entering a new column appends to
    // its end instead of keeping a position minted for the old column.
    if (body.status !== existing[0].status) {
      const [{ maxPos }] = await db
        .select({ maxPos: max(tasks.kanbanPosition) })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.status, body.status as Status)));
      set.kanbanPosition = (maxPos ?? -1) + 1;
    }
  }
  if (body.dueDate !== undefined) {
    set.dueDate =
      typeof body.dueDate === "string" && DATE_RE.test(body.dueDate) ? body.dueDate : null;
    // A time without a date is meaningless: clearing the date clears the time
    // (and the reminders that hang off it).
    if (set.dueDate === null) {
      set.dueTime = null;
      set.reminderOffsetsMin = [];
    }
  }
  if (body.dueTime !== undefined) {
    set.dueTime =
      typeof body.dueTime === "string" && TIME_RE.test(body.dueTime) ? body.dueTime : null;
  }
  if (body.reminderOffsetsMin !== undefined && set.reminderOffsetsMin === undefined) {
    set.reminderOffsetsMin = Array.isArray(body.reminderOffsetsMin)
      ? normalizeReminderOffsets(body.reminderOffsetsMin.filter((v) => typeof v === "number"))
      : [];
  }

  let projectIds: string[] | null = null;
  if (Array.isArray(body.projectIds)) {
    projectIds = await verifyProjects(userId, body.projectIds.slice(0, 20));
    if (projectIds === null) return bad("Unknown project");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set(set)
      .where(and(eq(tasks.id, body.id as string), eq(tasks.userId, userId)));
    if (projectIds !== null) {
      await tx
        .delete(tasksProjects)
        .where(and(eq(tasksProjects.taskId, body.id as string), eq(tasksProjects.userId, userId)));
      if (projectIds.length > 0) {
        await tx
          .insert(tasksProjects)
          .values(projectIds.map((pid) => ({ taskId: body.id as string, projectId: pid, userId })));
      }
    }
  });
  return Response.json({ ok: true }, { headers: CORS });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  return Response.json({ ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
