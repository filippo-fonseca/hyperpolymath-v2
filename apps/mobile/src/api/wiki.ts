// Single wiki client for /api/device/wiki/* — merges the two v1 clients
// (src/lib/wiki-api.ts and src/components/wiki-editor/wikiApi.ts) with one
// error contract: every call returns `T | null`, never throws. Callers that
// need to distinguish "missing" from "offline" can pass through the data
// layer, which retries; the editor treats null as "retry save".
//
// Shapes are frozen by the device API — do not drift.

import { call } from "./http";
import { localDateString } from "./device";

export interface WikiFolder {
  id: string;
  name: string;
  parentId: string | null;
  positionKey: string | null;
}

/** Page metadata as returned by the tree endpoint (no content body). */
export interface WikiPageMeta {
  id: string;
  title: string;
  emoji: string | null;
  folderId: string | null;
  pinned: boolean;
  dailyDate: string | null;
  updatedAt: string;
}

export interface WikiTree {
  folders: WikiFolder[];
  pages: WikiPageMeta[];
}

/**
 * A full page. `contentJson` is the BlockNote document (array of blocks) or
 * null on legacy pages, in which case the markdown mirror `content` is
 * authoritative. When contentJson changes the server regenerates `content`.
 */
export interface WikiPage {
  id: string;
  title: string;
  emoji: string | null;
  folderId: string | null;
  pinned: boolean;
  url: string | null;
  contentJson: unknown[] | null;
  content: string | null;
  updatedAt: string;
}

export interface WikiPagePatch {
  title?: string;
  emoji?: string | null;
  folderId?: string | null;
  contentJson?: unknown[];
}

/** GET /api/device/wiki/tree — server-sorted folders + page metadata. */
export async function getWikiTree(): Promise<WikiTree | null> {
  return call<WikiTree>("/api/device/wiki/tree");
}

/** GET /api/device/wiki/pages/:id — full page (404/offline → null). */
export async function getWikiPage(id: string): Promise<WikiPage | null> {
  return call<WikiPage>(`/api/device/wiki/pages/${encodeURIComponent(id)}`);
}

/** POST /api/device/wiki/pages — create a blank (or seeded) page. */
export async function createWikiPage(input?: {
  title?: string;
  folderId?: string | null;
  contentJson?: unknown[];
}): Promise<WikiPage | null> {
  return call<WikiPage>("/api/device/wiki/pages", {
    method: "POST",
    body: input ?? {},
  });
}

/**
 * PATCH /api/device/wiki/pages/:id — persist any subset of fields. When
 * contentJson changes the server regenerates the markdown mirror and bumps
 * updatedAt.
 */
export async function updateWikiPage(
  id: string,
  patch: WikiPagePatch,
): Promise<WikiPage | null> {
  return call<WikiPage>(`/api/device/wiki/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

/**
 * GET /api/device/wiki/daily?date=YYYY-MM-DD — get-or-create the daily page.
 * Defaults to the user's local today. This is the "write it down" fast path.
 */
export async function getDailyPage(
  date: string = localDateString(0),
): Promise<WikiPage | null> {
  return call<WikiPage>(`/api/device/wiki/daily?date=${encodeURIComponent(date)}`);
}
