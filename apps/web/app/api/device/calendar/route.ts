import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { listCalendars } from "@/lib/gcal/calendars";
import { eventToDTO, type GcalEventDTO } from "@/lib/gcal/event-dto";
import { listEvents } from "@/lib/gcal/events";
import {
  GcalNotConnectedError,
  GcalTokenRevokedError,
  getValidGcalToken,
} from "@/lib/gcal/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function parseLimit(raw: string | null): number {
  if (!raw) return 25;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 25;
  return Math.min(Math.max(n, 1), 100);
}

/**
 * Read-only paired-device calendar feed.
 *
 * GET /api/device/calendar?limit=25
 *   -> { events, calendars, status: "connected" }
 *
 * Google Calendar remains the source of truth; this route only bridges the
 * existing web gcal client to mobile bearer auth.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const now = new Date();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [userRow] = await db
    .select({
      timezone: users.timezone,
      visibleCalendarIds: users.gcalVisibleCalendarIds,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  try {
    const cal = await getValidGcalToken(userId);
    const calendars = await listCalendars(cal);
    const visibleIds =
      userRow?.visibleCalendarIds && userRow.visibleCalendarIds.length > 0
        ? userRow.visibleCalendarIds
        : calendars.map((c) => c.id);

    const eventsPerCalendar = await Promise.all(
      visibleIds.map(async (calendarId) => {
        const { data } = await listEvents(cal, {
          calendarId,
          timeMin: now.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: limit,
          timeZone: userRow?.timezone ?? "UTC",
        });
        return (data.items ?? [])
          .map((event) => eventToDTO(event, calendarId))
          .filter((event): event is GcalEventDTO => event !== null);
      }),
    );

    const events = eventsPerCalendar
      .flat()
      .sort((a, z) => a.start.localeCompare(z.start))
      .slice(0, limit);

    return Response.json({ status: "connected", events, calendars }, { headers: CORS });
  } catch (err) {
    if (err instanceof GcalTokenRevokedError) {
      return Response.json(
        { status: "revoked", events: [], calendars: [], error: "Reconnect Google Calendar" },
        { status: 200, headers: CORS },
      );
    }
    if (err instanceof GcalNotConnectedError) {
      return Response.json(
        { status: "not_connected", events: [], calendars: [], error: "Google Calendar not connected" },
        { status: 200, headers: CORS },
      );
    }
    throw err;
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
