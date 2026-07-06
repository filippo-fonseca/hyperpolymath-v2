// GET /api/imessage/resolve?name=<person>
//
// Name → recent iMessage handle lookup for the desktop send_message gate. The
// desktop resolves a bare recipient NAME to a concrete handle before building
// the AppleScript send (the fix for texts landing on the wrong person). macOS
// Contacts is the desktop's primary, authoritative source; this endpoint is the
// tie-breaker / fallback: it cross-references the name against people the OWNER
// has ACTUALLY messaged, drawn from the ingested imessage_messages table
// (senderName resolved by the sync worker, sender = raw handle).
//
// Returns the distinct raw handles (phone/email) whose resolved senderName
// matches the queried name, most-recently-messaged first. The desktop uses this
// to (a) disambiguate multiple Contacts matches toward the person actually in
// the thread, and (b) resolve at all when Contacts permission is missing.
//
// Auth mirrors /api/jarvis/routines exactly: device bearer identity + owner
// gate. The name filter is a parameterized ILIKE — never string-interpolated.

import type { NextRequest } from "next/server";

import { and, desc, eq, ilike, isNotNull } from "drizzle-orm";

import { validateDesktopBearerIdentity } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { db } from "@/lib/db";
import { imessageMessages } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jarvis-Mode",
};

/** Cap on rows scanned — recent history is enough; the newest match wins. */
const SCAN_LIMIT = 200;

function isNameTokenMatch(candidate: string | null, query: string): boolean {
  const tokenKey = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const c = tokenKey(candidate ?? "");
  const q = tokenKey(query);
  if (!c || !q) return false;
  if (c === q || c.startsWith(`${q} `)) return true;
  return ` ${c} `.includes(` ${q} `);
}

/**
 * GET /api/imessage/resolve?name=Rohan
 *
 * → { handles: string[] } — distinct raw sender handles for people whose
 *   resolved contact name matches `name`, most-recent first. Empty array when
 *   nothing matches. Never throws blind — a DB error returns 500 and the
 *   desktop falls back to Contacts / an honest "couldn't find them" line.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const identity = await validateDesktopBearerIdentity(req);
  if (!identity) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  const userId = identity.userId;

  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return Response.json({ error: "Missing name" }, { status: 400, headers: CORS });
  }

  try {
    // Match the name against the resolved senderName (parameterized ILIKE with
    // wildcards bound as data, not interpolated SQL). Only inbound rows carry a
    // usable sender handle — fromMe rows are the owner's own outgoing messages,
    // so exclude them (and rows with a null sender).
    const rows = await db
      .select({
        sender: imessageMessages.sender,
        senderName: imessageMessages.senderName,
        sentAt: imessageMessages.sentAt,
      })
      .from(imessageMessages)
      .where(
        and(
          eq(imessageMessages.userId, userId),
          eq(imessageMessages.fromMe, false),
          isNotNull(imessageMessages.sender),
          ilike(imessageMessages.senderName, `%${name}%`),
        ),
      )
      .orderBy(desc(imessageMessages.sentAt))
      .limit(SCAN_LIMIT);

    // Distinct handles, newest-first order preserved (rows already sorted desc).
    const seen = new Set<string>();
    const handles: string[] = [];
    for (const r of rows) {
      if (!isNameTokenMatch(r.senderName, name)) continue;
      const h = r.sender?.trim();
      if (!h || seen.has(h)) continue;
      seen.add(h);
      handles.push(h);
    }
    return Response.json({ handles }, { headers: CORS });
  } catch (err) {
    console.error("[imessage/resolve] lookup failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS },
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
