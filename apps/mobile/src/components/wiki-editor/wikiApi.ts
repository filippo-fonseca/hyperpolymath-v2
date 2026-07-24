// Typed client for the device wiki API (/api/device/wiki/*), scoped to the
// editor's needs: read a page, create one, patch content, and get-or-create
// the daily page. Mirrors src/lib/data.ts's bearer-auth `call<T>` idiom.
//
// The tree/browse surface (unit-wiki-browse) owns its own reads; this module
// lives inside the editor's fenced directory so the two units never collide.
// The Conductor may dedupe into a shared lib/wiki.ts at integration.

import { fetch } from "expo/fetch";

import { authHeaders } from "../../lib/auth-token";
import { localDateString } from "../../lib/data";
import { getSettings } from "../../lib/settings";

function base(): string {
  return getSettings().serverUrl.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...authHeaders(),
  };
}

/**
 * The full page shape returned by GET/POST/PATCH pages (API-CONTRACT §2).
 * `contentJson` is the BlockNote document (an array of blocks) or null for a
 * legacy page, in which case the client seeds from the markdown `content`.
 */
export interface WikiPage {
  id: string;
  title: string;
  emoji: string | null;
  folderId: string | null;
  pinned: boolean;
  url: string | null;
  /** BlockNote document JSON — `Block[]` or null (legacy → use `content`). */
  contentJson: unknown[] | null;
  content: string | null;
  updatedAt: string;
}

class WikiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WikiApiError";
  }
}

/** Hard ceiling per editor call so a hung load/save rejects (→ loadError /
 * "retry save") instead of leaving the editor spinning forever. */
const REQUEST_TIMEOUT_MS = 15_000;

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${base()}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(),
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore body read failures
    }
    console.warn(`[wiki] ${init?.method ?? "GET"} ${path} → ${res.status} ${detail}`);
    throw new WikiApiError(`${init?.method ?? "GET"} ${path} failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

/** GET /api/device/wiki/pages/:id — 404 throws WikiApiError(status 404). */
export function getPage(id: string): Promise<WikiPage> {
  return call<WikiPage>(`/api/device/wiki/pages/${encodeURIComponent(id)}`);
}

/** POST /api/device/wiki/pages — create a blank (or seeded) page. */
export function createPage(input?: {
  title?: string;
  folderId?: string | null;
  contentJson?: unknown[];
}): Promise<WikiPage> {
  return call<WikiPage>("/api/device/wiki/pages", { method: "POST", body: input ?? {} });
}

/**
 * PATCH /api/device/wiki/pages/:id — persist any subset of fields. When
 * contentJson changes the server regenerates the markdown mirror + bumps
 * updatedAt (API-CONTRACT §4).
 */
export function patchPage(
  id: string,
  patch: {
    title?: string;
    emoji?: string | null;
    folderId?: string | null;
    contentJson?: unknown[];
  },
): Promise<WikiPage> {
  return call<WikiPage>(`/api/device/wiki/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

/**
 * GET /api/device/wiki/daily?date=YYYY-MM-DD — get-or-create the daily page.
 * Defaults to the user's local today. This is the "write it down" fast path.
 */
export function getDailyPage(date: string = localDateString(0)): Promise<WikiPage> {
  return call<WikiPage>(`/api/device/wiki/daily?date=${encodeURIComponent(date)}`);
}

export { WikiApiError };
