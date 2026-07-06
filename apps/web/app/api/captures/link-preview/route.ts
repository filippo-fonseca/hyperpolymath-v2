/**
 * /api/captures/link-preview — read cached link-preview metadata for a set of
 * URLs, and lazily trigger a fetch for any not yet seen (issue #221,
 * "fetch-on-first-view"). The client passes the URLs it is about to render; we
 * return whatever is cached now (possibly nothing on the very first view) and
 * schedule the fetch via after() so a subsequent read resolves.
 *
 * Auth: Supabase session via getClaims() (CLAUDE.md Critical Pattern 1). Only the
 * caller's own previews are ever returned (rows are user_id-scoped).
 * Runtime: Node (outbound fetch + Drizzle).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLinkPreviews } from "@/lib/db/queries/link-previews";
import { scheduleLinkPreviewUrls } from "@/lib/link-preview/schedule";
import { normalizeUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URLS = 24;

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = Array.isArray(body.urls) ? body.urls : [];
  const urls = Array.from(
    new Set(
      raw
        .filter((u): u is string => typeof u === "string")
        .map((u) => normalizeUrl(u))
        .filter((u): u is string => u != null),
    ),
  ).slice(0, MAX_URLS);

  if (urls.length === 0) {
    return NextResponse.json({ previews: [] });
  }

  const previews = await getLinkPreviews(userId, urls);
  // Kick off fetches for URLs we have no row for yet; harmless if all are cached.
  const known = new Set(previews.map((p) => p.url));
  const unknown = urls.filter((u) => !known.has(u));
  if (unknown.length > 0) scheduleLinkPreviewUrls(userId, unknown);

  return NextResponse.json({ previews });
}
