import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { db } from "@/lib/db";
import { pageFolders, pages } from "@/lib/db/schema";

import { CORS, unauthorized } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/device/wiki/tree — the whole wiki skeleton for the device: folders +
 * page headers, no content bodies (API-CONTRACT #1). Sorted server-side so the
 * client renders a stable tree without re-sorting: folders by name; pages
 * pinned-first, then (positionKey NULLS LAST, title). The NULLS-LAST tiebreak is
 * done in JS because it is exact and Postgres-dialect-independent.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const userId = await validateDesktopBearer(req);
  if (!userId) return unauthorized();

  const [folderRows, pageRows] = await Promise.all([
    db
      .select({
        id: pageFolders.id,
        name: pageFolders.name,
        parentId: pageFolders.parentId,
        color: pageFolders.color,
        positionKey: pageFolders.positionKey,
      })
      .from(pageFolders)
      .where(eq(pageFolders.userId, userId)),
    db
      .select({
        id: pages.id,
        title: pages.title,
        emoji: pages.emoji,
        folderId: pages.folderId,
        pinned: pages.pinned,
        dailyDate: pages.dailyDate,
        updatedAt: pages.updatedAt,
        positionKey: pages.positionKey,
      })
      .from(pages)
      .where(eq(pages.userId, userId)),
  ]);

  const folders = folderRows
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedPages = pageRows.slice().sort((a, b) => {
    // Pinned first.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    // positionKey NULLS LAST.
    if (a.positionKey !== b.positionKey) {
      if (a.positionKey === null) return 1;
      if (b.positionKey === null) return -1;
      if (a.positionKey !== b.positionKey) return a.positionKey < b.positionKey ? -1 : 1;
    }
    // Title tiebreak.
    return a.title.localeCompare(b.title);
  });

  return Response.json(
    {
      folders,
      // Drop the sort-only positionKey from the page payload (contract shape).
      pages: sortedPages.map(({ positionKey: _positionKey, ...p }) => p),
    },
    { headers: CORS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
