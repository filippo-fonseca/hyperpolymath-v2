import { fetchLinkPreview } from "@/lib/link-preview/fetch";
import { safeParseUrl } from "@/lib/link-preview/classify";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cachedLinkPreview = unstable_cache(
  async (url: string) => fetchLinkPreview(url),
  ["wiki-link-embed"],
  { revalidate: 60 * 60 * 24 }
);

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = typeof body.url === "string" ? safeParseUrl(body.url.trim()) : null;
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  return NextResponse.json(await cachedLinkPreview(parsed.href));
}
