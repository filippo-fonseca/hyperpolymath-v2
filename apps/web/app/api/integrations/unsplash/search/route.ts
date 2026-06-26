/**
 * GET /api/integrations/unsplash/search?query=...&page=1 — Unsplash photo search
 * proxy for the Wiki page cover-image picker (issue #28).
 *
 * Why a server route: the Unsplash Access Key must NEVER reach the client. The
 * browser calls this route; the route attaches the key server-side and returns a
 * trimmed, attribution-bearing result set.
 *
 * Auth: getClaims() per CLAUDE.md Critical Pattern 1 (NOT getSession). Only a
 * signed-in user may hit the proxy, so the owner's key can't be used as an open
 * relay.
 *
 * Graceful degradation: when UNSPLASH_ACCESS_KEY is unset the route returns
 * 200 { configured: false, results: [] } (NOT an error) so the picker can show a
 * "set UNSPLASH_ACCESS_KEY" empty state while the image-URL tab keeps working.
 *
 * Attribution: each result carries the photographer's name + profile link and the
 * `downloadLocation` endpoint, per the Unsplash API Guidelines. The client shows
 * the credit when a photo is chosen and pings the download endpoint on selection.
 *
 * Runtime: Node (server-only env access; no Edge-specific needs).
 */

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/ratelimit/in-memory";
import type { UnsplashPhoto } from "@/lib/pages/unsplash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UnsplashApiPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
}

export async function GET(req: Request): Promise<Response> {
  // 1. Auth (getClaims, not getSession — CLAUDE.md §1).
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claims.data.claims.sub;

  // 2. Per-user rate limit (best-effort, per-instance) — Unsplash demo keys are
  //    50 req/hr, so keep the proxy from burning the budget on a hot keypress.
  const rl = checkRateLimit(`unsplash:${userId}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // 3. Missing key → graceful "not configured" state (NOT an error). The picker
  //    shows a hint and the image-URL tab still works.
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return Response.json({ configured: false, results: [] });
  }

  // 4. Parse + validate query params.
  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) {
    return Response.json({ configured: true, results: [] });
  }
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.min(pageParam, 20) : 1;

  // 5. Proxy to Unsplash. Key travels in the Authorization header, never the URL.
  const apiUrl = new URL("https://api.unsplash.com/search/photos");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("page", String(page));
  apiUrl.searchParams.set("per_page", "24");
  apiUrl.searchParams.set("content_filter", "high");
  apiUrl.searchParams.set("orientation", "landscape");

  let upstream: Response;
  try {
    upstream = await fetch(apiUrl, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      // No caching: search results are query-specific and cheap to refetch.
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    // Do NOT leak the upstream body (may echo the key context). Map status only.
    const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
    return Response.json({ error: "upstream_error" }, { status });
  }

  const data = (await upstream.json()) as { results?: UnsplashApiPhoto[] };
  const results: UnsplashPhoto[] = (data.results ?? []).map((p) => ({
    id: p.id,
    thumbUrl: p.urls.small,
    fullUrl: p.urls.regular,
    authorName: p.user.name,
    authorUrl: p.user.links.html,
    alt: p.alt_description ?? p.description ?? query,
    downloadLocation: p.links.download_location,
  }));

  return Response.json({ configured: true, results });
}
