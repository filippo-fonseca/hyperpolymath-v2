import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { pageFolders, pages } from "@/lib/db/schema";
import { contentJsonToMarkdown } from "@/lib/wiki/device-serializers";

import { CORS, bad, getFullPage, unauthorized } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/device/wiki/pages — create a page (API-CONTRACT #3). body
 * { title?, folderId?, contentJson? }; defaults title "", folderId null. When
 * contentJson is given the markdown mirror is regenerated server-side (same as
 * the web editor's save), so search/export stay coherent for device-authored
 * pages. Returns the full-page shape (#2). folderId is honored only if owned.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return unauthorized();

  let body: { title?: unknown; folderId?: unknown; contentJson?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";

  // Honor folderId only when the user owns it (mirrors createPage).
  let folderId: string | null = null;
  if (typeof body.folderId === "string" && body.folderId) {
    const [folder] = await db
      .select({ id: pageFolders.id })
      .from(pageFolders)
      .where(and(eq(pageFolders.id, body.folderId), eq(pageFolders.userId, userId)))
      .limit(1);
    if (!folder) return bad("Unknown folder");
    folderId = folder.id;
  }

  const hasJson = body.contentJson !== undefined && body.contentJson !== null;
  const content = hasJson ? await contentJsonToMarkdown(body.contentJson) : "";

  const [inserted] = await db
    .insert(pages)
    .values({
      userId,
      title,
      folderId,
      content,
      ...(hasJson ? { contentJson: body.contentJson } : {}),
    })
    .returning({ id: pages.id });

  const page = await getFullPage(userId, inserted.id);
  if (!page) return bad("Failed to create page", 500);
  return Response.json(page, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
