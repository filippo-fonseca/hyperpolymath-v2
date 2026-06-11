import { and, asc, eq, gte, isNull, lte, max } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { habitCompletions, habits } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(error: string): Response {
  return Response.json({ error }, { status: 400, headers: CORS });
}

/**
 * Paired-device CRUD for habits — bearer-auth twin of app/actions/habits.ts.
 *   GET ?start=YYYY-MM-DD&end=YYYY-MM-DD → active habits + completions in range
 *   POST   → create { name, description?, icon?, daysOfWeek }
 *   PATCH  → update { id, name?, description?, icon?, daysOfWeek?, archived? }
 *   PUT    → toggle completion { habitId, completedDate, completed }
 *   DELETE ?id= → hard delete
 * completedDate is a plain YYYY-MM-DD in the USER's local day — stored
 * verbatim, no timezone math (matches the web habits contract).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  const habitRows = await db
    .select({
      id: habits.id,
      name: habits.name,
      description: habits.description,
      icon: habits.icon,
      daysOfWeek: habits.daysOfWeek,
      orderIndex: habits.orderIndex,
    })
    .from(habits)
    .where(and(eq(habits.userId, userId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.orderIndex), asc(habits.createdAt));

  let completions: Array<{ habitId: string; completedDate: string }> = [];
  if (start && end && DATE_RE.test(start) && DATE_RE.test(end)) {
    const rows = await db
      .select({
        habitId: habitCompletions.habitId,
        completedDate: habitCompletions.completedDate,
      })
      .from(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, userId),
          gte(habitCompletions.completedDate, start),
          lte(habitCompletions.completedDate, end),
        ),
      );
    completions = rows.map((r) => ({
      habitId: r.habitId,
      completedDate: String(r.completedDate),
    }));
  }

  return Response.json({ habits: habitRows, completions }, { headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    name?: string;
    description?: string | null;
    icon?: string | null;
    daysOfWeek?: boolean[];
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return bad("Name required");
  const daysOfWeek =
    Array.isArray(body.daysOfWeek) && body.daysOfWeek.length === 7
      ? body.daysOfWeek.map(Boolean)
      : [true, true, true, true, true, true, true];

  const id = crypto.randomUUID();
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(habits.orderIndex) })
    .from(habits)
    .where(eq(habits.userId, userId));
  await db.insert(habits).values({
    id,
    userId,
    name,
    description: body.description ? String(body.description).slice(0, 500) : null,
    icon: body.icon ? String(body.icon).slice(0, 64) : null,
    daysOfWeek,
    orderIndex: (maxOrder ?? -1) + 1,
  });
  return Response.json({ id }, { headers: CORS });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    id?: string;
    name?: string;
    description?: string | null;
    icon?: string | null;
    daysOfWeek?: boolean[];
    archived?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (typeof body.id !== "string") return bad("id required");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim().slice(0, 120);
  if (body.description !== undefined) {
    set.description = body.description ? String(body.description).slice(0, 500) : null;
  }
  if (body.icon !== undefined) set.icon = body.icon ? String(body.icon).slice(0, 64) : null;
  if (Array.isArray(body.daysOfWeek) && body.daysOfWeek.length === 7) {
    set.daysOfWeek = body.daysOfWeek.map(Boolean);
  }
  if (typeof body.archived === "boolean") {
    set.archivedAt = body.archived ? new Date() : null;
  }

  await db
    .update(habits)
    .set(set)
    .where(and(eq(habits.id, body.id), eq(habits.userId, userId)));
  return Response.json({ ok: true }, { headers: CORS });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: { habitId?: string; completedDate?: string; completed?: boolean };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (
    typeof body.habitId !== "string" ||
    typeof body.completedDate !== "string" ||
    !DATE_RE.test(body.completedDate) ||
    typeof body.completed !== "boolean"
  ) {
    return bad("habitId, completedDate (YYYY-MM-DD), completed required");
  }

  // Ownership check before touching completions.
  const owned = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.id, body.habitId), eq(habits.userId, userId)))
    .limit(1);
  if (!owned[0]) return bad("Not found");

  if (body.completed) {
    await db
      .insert(habitCompletions)
      .values({
        habitId: body.habitId,
        userId,
        completedDate: body.completedDate,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(habitCompletions)
      .where(
        and(
          eq(habitCompletions.habitId, body.habitId),
          eq(habitCompletions.userId, userId),
          eq(habitCompletions.completedDate, body.completedDate),
        ),
      );
  }
  return Response.json({ completed: body.completed }, { headers: CORS });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  await db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId)));
  return Response.json({ ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
