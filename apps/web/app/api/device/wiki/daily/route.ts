import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { dailyPageTitle, isValidDailyDate } from "@/lib/pages/daily-page";

import { CORS, bad, getFullPage, unauthorized } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/device/wiki/daily?date=yyyy-MM-dd — get-or-create the user's Daily
 * Page for `date` (API-CONTRACT #5). Race-safe against concurrent opens the
 * same way the web `openDailyPage` action is: SELECT fast-path, then a guarded
 * INSERT ... ON CONFLICT DO NOTHING against the partial unique index
 * pages_user_daily_date_uniq, then re-SELECT so whichever insert won the race
 * is returned. Returns the full-page shape (#2).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return unauthorized();

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !isValidDailyDate(date)) return bad("Expected a yyyy-MM-dd date");

  // Fast path: the day's page already exists.
  const existing = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.userId, userId), eq(pages.dailyDate, date)))
    .limit(1);

  let pageId = existing[0]?.id;

  if (!pageId) {
    // Guarded insert — a no-op when a concurrent open already created the page.
    await db
      .insert(pages)
      .values({
        userId,
        title: dailyPageTitle(date),
        content: "",
        dailyDate: date,
      })
      .onConflictDoNothing({
        target: [pages.userId, pages.dailyDate],
        where: sql`daily_date IS NOT NULL`,
      });

    // Re-select: whether our insert or a racing one won, the row now exists.
    const row = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.userId, userId), eq(pages.dailyDate, date)))
      .limit(1);
    pageId = row[0]?.id;
  }

  if (!pageId) return bad("Failed to open daily page", 500);

  const page = await getFullPage(userId, pageId);
  if (!page) return bad("Failed to open daily page", 500);
  return Response.json(page, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
