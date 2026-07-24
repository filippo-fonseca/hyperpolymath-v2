import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";

/**
 * Shared helpers for the device wiki API (issue #329). Underscore-prefixed so
 * Next's App Router treats it as a private module, never a route. Kept
 * dependency-light (no BlockNote import) so the read-only tree route stays lean.
 */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

export function bad(error: string, status = 400): Response {
  return Response.json({ error }, { status, headers: CORS });
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401, headers: CORS });
}

/** The full-page response shape (API-CONTRACT #2), reused by POST/PATCH/daily. */
export interface DeviceWikiPage {
  id: string;
  title: string;
  emoji: string | null;
  folderId: string | null;
  pinned: boolean;
  url: string | null;
  contentJson: unknown;
  content: string;
  updatedAt: Date;
}

const FULL_PAGE_COLS = {
  id: pages.id,
  title: pages.title,
  emoji: pages.emoji,
  folderId: pages.folderId,
  pinned: pages.pinned,
  url: pages.url,
  contentJson: pages.contentJson,
  content: pages.content,
  updatedAt: pages.updatedAt,
} as const;

/** Fetch a single owned page in the full-page shape, or null if not found. */
export async function getFullPage(
  userId: string,
  id: string,
): Promise<DeviceWikiPage | null> {
  const rows = await db
    .select(FULL_PAGE_COLS)
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
