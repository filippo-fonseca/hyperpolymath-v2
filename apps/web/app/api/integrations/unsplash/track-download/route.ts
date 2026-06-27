/**
 * POST /api/integrations/unsplash/track-download — Unsplash download tracking
 * proxy for the page cover picker (issue #28).
 *
 * The Unsplash API Guidelines require an app to hit a photo's `download_location`
 * endpoint whenever the photo is "used" (here: chosen as a page cover). This must
 * happen server-side so the Access Key stays secret. The client POSTs the
 * download_location URL it got from the search proxy; we validate it's an
 * api.unsplash.com URL, attach the key, and fire-and-forget the ping.
 *
 * Auth: getClaims() per CLAUDE.md §1. Best-effort: any failure (no key, bad URL,
 * upstream error) returns 200 { ok: false } rather than blocking the cover save —
 * tracking is a courtesy ping, not part of the save's correctness.
 *
 * Runtime: Node.
 */

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // Must be an Unsplash API download_location URL.
  downloadLocation: z.string().url().max(2000),
});

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return Response.json({ ok: false });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false });

  // SSRF guard: only ping the official Unsplash API host. The download_location
  // always lives under api.unsplash.com, so anything else is rejected.
  let target: URL;
  try {
    target = new URL(parsed.data.downloadLocation);
  } catch {
    return Response.json({ ok: false });
  }
  if (target.protocol !== "https:" || target.hostname !== "api.unsplash.com") {
    return Response.json({ ok: false });
  }

  try {
    await fetch(target, {
      headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" },
      cache: "no-store",
    });
  } catch {
    // Courtesy ping — swallow failures.
  }

  return Response.json({ ok: true });
}
