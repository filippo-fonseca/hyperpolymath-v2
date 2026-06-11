import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { hashtags, projects, users } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/jarvis/voice/context
 *
 * Composer context for paired devices (mobile text bar): the user's
 * projects ($-mentions), hashtags (#-suggestions), and IANA timezone
 * (client-side chrono date parsing). The web console gets these via
 * Server Component props — paired devices have no Supabase session, so
 * this is the bearer-auth equivalent.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const [projectRows, hashtagRows, userRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, icon: projects.icon })
      .from(projects)
      .where(and(eq(projects.userId, userId), isNull(projects.archivedAt))),
    db
      .select({ name: hashtags.name, displayName: hashtags.displayName })
      .from(hashtags)
      .where(eq(hashtags.userId, userId)),
    db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  return Response.json(
    {
      projects: projectRows,
      hashtags: hashtagRows,
      timezone: userRows[0]?.timezone ?? null,
    },
    { headers: CORS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
