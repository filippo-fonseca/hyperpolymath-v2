import { db } from "@/lib/db";
import { linkPreviews } from "@/lib/db/schema";
import type { LinkPreviewRecord } from "@/lib/link-preview/types";
import type { LinkPreviewResult } from "@/lib/link-preview/types";
// Issue #221 — query helpers for the cached link_previews table.
import { and, eq, inArray } from "drizzle-orm";

function toRecord(row: typeof linkPreviews.$inferSelect): LinkPreviewRecord {
  return {
    url: row.url,
    status: (row.status as LinkPreviewRecord["status"]) ?? "pending",
    mediaType: (row.mediaType as LinkPreviewRecord["mediaType"]) ?? null,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    faviconUrl: row.faviconUrl,
    siteName: row.siteName,
    providerData: row.providerData ?? null,
  };
}

/** Fetch cached previews for a set of URLs belonging to one user. */
export async function getLinkPreviews(
  userId: string,
  urls: string[]
): Promise<LinkPreviewRecord[]> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (unique.length === 0) return [];
  const rows = await db
    .select()
    .from(linkPreviews)
    .where(and(eq(linkPreviews.userId, userId), inArray(linkPreviews.url, unique)));
  return rows.map(toRecord);
}

/** Which of the given URLs already have a row (any status) for this user. */
export async function getExistingPreviewUrls(userId: string, urls: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ url: linkPreviews.url })
    .from(linkPreviews)
    .where(and(eq(linkPreviews.userId, userId), inArray(linkPreviews.url, unique)));
  return new Set(rows.map((r) => r.url));
}

/**
 * Insert placeholder rows (status='pending') for any URLs that don't yet have a
 * row for this user. No-op on conflict (the (user_id, url) unique index). Returns
 * the URLs that were newly inserted (i.e. still need fetching).
 */
export async function ensurePendingPreviews(userId: string, urls: string[]): Promise<string[]> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (unique.length === 0) return [];
  const existing = await getExistingPreviewUrls(userId, unique);
  const missing = unique.filter((u) => !existing.has(u));
  if (missing.length === 0) return [];
  await db
    .insert(linkPreviews)
    .values(missing.map((url) => ({ userId, url, status: "pending" as const })))
    .onConflictDoNothing({ target: [linkPreviews.userId, linkPreviews.url] });
  return missing;
}

/** Upsert the resolved metadata for a URL (keyed on user_id + url). */
export async function upsertLinkPreview(userId: string, result: LinkPreviewResult): Promise<void> {
  const values = {
    userId,
    url: result.url,
    status: result.status,
    mediaType: result.mediaType,
    title: result.title,
    description: result.description,
    imageUrl: result.imageUrl,
    faviconUrl: result.faviconUrl,
    siteName: result.siteName,
    providerData: result.providerData,
    error: result.error,
    fetchedAt: new Date(),
    updatedAt: new Date(),
  };
  await db
    .insert(linkPreviews)
    .values(values)
    .onConflictDoUpdate({
      target: [linkPreviews.userId, linkPreviews.url],
      set: {
        status: values.status,
        mediaType: values.mediaType,
        title: values.title,
        description: values.description,
        imageUrl: values.imageUrl,
        faviconUrl: values.faviconUrl,
        siteName: values.siteName,
        providerData: values.providerData,
        error: values.error,
        fetchedAt: values.fetchedAt,
        updatedAt: values.updatedAt,
      },
    });
}
