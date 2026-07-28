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
  "Access-Control-Allow-Methods": "GET, DELETE, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function parseLimit(raw: string | null): number {
  if (!raw) return 25;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 25;
  return Math.min(Math.max(n, 1), 250);
}

function gcalErrorStatus(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const err = e as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  const fromCode =
    typeof err.code === "number"
      ? err.code
      : typeof err.code === "string" && /^\d+$/.test(err.code)
        ? Number(err.code)
        : undefined;
  return fromCode ?? err.status ?? err.response?.status;
}

/**
 * Paired-device calendar bridge.
 *
 * GET /api/device/calendar?limit=25&timeMin=&timeMax=&overdue=1
 * POST /api/device/calendar  { action: "archive", items: [{calendarId,eventId}] }
 * DELETE /api/device/calendar  same body as POST archive
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const overdueOnly = req.nextUrl.searchParams.get("overdue") === "1";
  const now = new Date();
  const timeMinParam = req.nextUrl.searchParams.get("timeMin");
  const timeMaxParam = req.nextUrl.searchParams.get("timeMax");
  const timeMin = timeMinParam
    ? new Date(timeMinParam)
    : overdueOnly
      ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      : now;
  const timeMax = timeMaxParam
    ? new Date(timeMaxParam)
    : overdueOnly
      ? now
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime())) {
    return Response.json({ error: "Invalid timeMin/timeMax" }, { status: 400, headers: CORS });
  }

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
          timeMin: timeMin.toISOString(),
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

    let events = eventsPerCalendar
      .flat()
      .sort((a, z) => a.start.localeCompare(z.start));

    if (overdueOnly) {
      const nowMs = now.getTime();
      events = events.filter((e) => {
        const endMs = e.allDay
          ? new Date(`${(e.end ?? e.start).slice(0, 10)}T23:59:59`).getTime()
          : new Date(e.end || e.start).getTime();
        return endMs < nowMs;
      });
    }

    events = events.slice(0, limit);

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

async function archiveFromBody(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return new Response("Unauthorized", { status: 401, headers: CORS });

  let body: {
    action?: string;
    items?: { calendarId?: string; eventId?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (body.action && body.action !== "archive") {
    return Response.json({ error: "Unknown action" }, { status: 400, headers: CORS });
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .filter(
      (i): i is { calendarId: string; eventId: string } =>
        typeof i?.calendarId === "string" &&
        i.calendarId.length > 0 &&
        typeof i?.eventId === "string" &&
        i.eventId.length > 0,
    )
    .slice(0, 200);

  if (items.length === 0) {
    return Response.json({ error: "items required" }, { status: 400, headers: CORS });
  }

  try {
    const cal = await getValidGcalToken(userId);
    let archived = 0;
    const failed: { eventId: string; error: string }[] = [];
    for (const item of items) {
      try {
        await cal.events.delete({
          calendarId: item.calendarId,
          eventId: item.eventId,
        });
        archived += 1;
      } catch (e) {
        const status = gcalErrorStatus(e);
        if (status === 410 || status === 404) {
          archived += 1;
          continue;
        }
        failed.push({
          eventId: item.eventId,
          error: e instanceof Error ? e.message : "Delete failed",
        });
      }
    }
    return Response.json({ ok: true, archived, failed }, { headers: CORS });
  } catch (err) {
    if (err instanceof GcalTokenRevokedError) {
      return Response.json(
        { error: "Reconnect Google Calendar", kind: "revoked" },
        { status: 409, headers: CORS },
      );
    }
    if (err instanceof GcalNotConnectedError) {
      return Response.json(
        { error: "Google Calendar not connected", kind: "not_connected" },
        { status: 409, headers: CORS },
      );
    }
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return archiveFromBody(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return archiveFromBody(req);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
