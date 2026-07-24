// Typed client for the device Wiki API (/api/device/wiki/*). Mirrors the
// data.ts idiom exactly: bearer-auth via authHeaders(), serverUrl from
// settings, every call returns `T | null` (null on any network / non-2xx
// error) so screens degrade to an error/empty state instead of throwing.
//
// Shapes are frozen by specs/API-CONTRACT.md — do not drift.

import { fetch } from "expo/fetch";

import { authHeaders } from "./auth-token";
import { getSettings } from "./settings";

function base(): string {
  return getSettings().serverUrl.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...authHeaders(),
  };
}

/** Hard ceiling per wiki call so a hung request degrades to a retryable error
 * (null) instead of an infinite loader. */
const REQUEST_TIMEOUT_MS = 15_000;

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(),
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[wiki] ${init?.method ?? "GET"} ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[wiki] ${path} failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Types (API-CONTRACT §1–5) ────────────────────────────────────────────────

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
 * A full page. `contentJson` is the BlockNote document (may be null on legacy
 * pages, in which case the markdown mirror `content` is authoritative).
 * `content` is the server-regenerated markdown mirror.
 */
export interface WikiPage {
  id: string;
  title: string;
  emoji: string | null;
  folderId: string | null;
  pinned: boolean;
  url: string | null;
  contentJson: unknown | null;
  content: string;
  updatedAt: string;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** GET /api/device/wiki/tree — server-sorted folders + page metadata. */
export async function getWikiTree(): Promise<WikiTree | null> {
  return call<WikiTree>("/api/device/wiki/tree");
}

/** GET /api/device/wiki/pages/:id — full page (404 → null). */
export async function getWikiPage(id: string): Promise<WikiPage | null> {
  return call<WikiPage>(`/api/device/wiki/pages/${encodeURIComponent(id)}`);
}

/** GET /api/device/wiki/daily?date=yyyy-MM-dd — get-or-create the daily page. */
export async function getDailyPage(date: string): Promise<WikiPage | null> {
  return call<WikiPage>(`/api/device/wiki/daily?date=${encodeURIComponent(date)}`);
}

// ── Writes (used by unit-wiki-editor; provided here so the client is whole) ───

/** POST /api/device/wiki/pages — create a page, returns the full shape. */
export async function createWikiPage(input: {
  title?: string;
  folderId?: string | null;
  contentJson?: unknown;
}): Promise<WikiPage | null> {
  return call<WikiPage>("/api/device/wiki/pages", { method: "POST", body: input });
}

/**
 * PATCH /api/device/wiki/pages/:id — update any subset of fields. When
 * contentJson changes the server regenerates the markdown mirror.
 */
export async function updateWikiPage(
  id: string,
  patch: {
    title?: string;
    emoji?: string | null;
    folderId?: string | null;
    contentJson?: unknown;
  },
): Promise<WikiPage | null> {
  return call<WikiPage>(`/api/device/wiki/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}
