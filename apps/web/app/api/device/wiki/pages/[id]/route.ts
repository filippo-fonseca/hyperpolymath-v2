import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { pageFolders, pages } from "@/lib/db/schema";
import { contentJsonToMarkdown } from "@/lib/wiki/device-serializers";

import { CORS, bad, getFullPage, unauthorized } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/device/wiki/pages/:id — one page in the full shape (API-CONTRACT #2).
 * 404 if not owned/found. contentJson may be null (legacy page; the client
 * falls back to the markdown `content`).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return unauthorized();
  const { id } = await params;
  const page = await getFullPage(userId, id);
  if (!page) return bad("Not found", 404);
  return Response.json(page, { headers: CORS });
}

/**
 * PATCH /api/device/wiki/pages/:id — update any of { title, emoji, folderId,
 * contentJson } (API-CONTRACT #4). When contentJson is present the markdown
 * mirror `content` is regenerated the same way the web editor does. updatedAt
 * bumps on any change. Returns the full-page shape. 404 if not owned/found.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return unauthorized();
  const { id } = await params;

  let body: {
    title?: unknown;
    emoji?: unknown;
    folderId?: unknown;
    contentJson?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  // Ownership gate (404 rather than leaking existence).
  const existing = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.userId, userId)))
    .limit(1);
  if (!existing[0]) return bad("Not found", 404);

  const set: Record<string, unknown> = {};

  if (typeof body.title === "string") set.title = body.title.trim().slice(0, 500);

  if ("emoji" in body) {
    if (body.emoji === null) set.emoji = null;
    else if (typeof body.emoji === "string") set.emoji = body.emoji.slice(0, 32);
    else return bad("Invalid emoji");
  }

  if ("folderId" in body) {
    if (body.folderId === null) {
      set.folderId = null;
    } else if (typeof body.folderId === "string" && body.folderId) {
      const [folder] = await db
        .select({ id: pageFolders.id })
        .from(pageFolders)
        .where(and(eq(pageFolders.id, body.folderId), eq(pageFolders.userId, userId)))
        .limit(1);
      if (!folder) return bad("Unknown folder");
      set.folderId = folder.id;
    } else {
      return bad("Invalid folderId");
    }
  }

  if ("contentJson" in body) {
    set.contentJson = body.contentJson ?? null;
    set.content = await contentJsonToMarkdown(body.contentJson);
  }

  // No recognized fields: idempotent no-op, return the current page unchanged.
  if (Object.keys(set).length > 0) {
    set.updatedAt = sql`now()`;
    await db
      .update(pages)
      .set(set)
      .where(and(eq(pages.id, id), eq(pages.userId, userId)));
  }

  const page = await getFullPage(userId, id);
  if (!page) return bad("Not found", 404);
  return Response.json(page, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
