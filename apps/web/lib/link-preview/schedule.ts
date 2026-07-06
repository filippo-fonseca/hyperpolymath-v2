import { ensurePendingPreviews, upsertLinkPreview } from "@/lib/db/queries/link-previews";
import { extractUrls } from "@/lib/url";
/**
 * schedule.ts — background link-preview fetching for captures (issue #221).
 *
 * After a capture is created or edited through ANY entry point, we extract its
 * URLs, insert placeholder `link_previews` rows, and fetch metadata for the ones
 * we haven't seen before. Like auto-tag, this runs via `after()` so it executes
 * AFTER the response is sent and never delays the capture write, and it is
 * entirely fail-soft: a fetch failure only means that URL degrades to a plain
 * link, nothing breaks the create/update path.
 */
import { after } from "next/server";
import { fetchLinkPreview } from "./fetch";

const MAX_URLS_PER_CAPTURE = 8;
const FETCH_CONCURRENCY = 3;

async function fetchAndStore(userId: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  // Bounded-concurrency cursor loop (mirrors the captures-to-issues cron).
  let cursor = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        const result = await fetchLinkPreview(url);
        await upsertLinkPreview(userId, result);
      } catch (err) {
        console.error("[link-preview] fetch/store failed", url, err);
      }
    }
  });
  await Promise.all(workers);
}

/**
 * Schedule background link-preview fetching for a capture's content (+ optional
 * canonical `url` property). Returns immediately; the work runs after the
 * response via `after()`. Only URLs without an existing row are fetched, so
 * edits and re-saves don't re-fetch what's already cached.
 */
export function scheduleLinkPreviews(
  userId: string,
  content: string,
  seedUrl?: string | null
): void {
  const urls = extractUrls(content, seedUrl).slice(0, MAX_URLS_PER_CAPTURE);
  scheduleLinkPreviewUrls(userId, urls);
}

/**
 * Schedule background fetching for an explicit list of URLs (issue #221). Used by
 * the on-view API route. Inserts pending rows, then fetches only the ones that
 * didn't already have a row. Runs after the response via after(); fail-soft.
 */
export function scheduleLinkPreviewUrls(userId: string, urls: string[]): void {
  const capped = Array.from(new Set(urls.filter(Boolean))).slice(0, MAX_URLS_PER_CAPTURE);
  if (capped.length === 0) return;
  after(async () => {
    try {
      const missing = await ensurePendingPreviews(userId, capped);
      await fetchAndStore(userId, missing);
    } catch (err) {
      console.error("[link-preview] scheduling failed", err);
    }
  });
}
