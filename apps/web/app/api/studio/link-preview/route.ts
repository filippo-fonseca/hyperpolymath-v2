import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLinkPreview } from "@/lib/link-preview/fetch";
import { safeParseUrl } from "@/lib/link-preview/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cachedPreview = unstable_cache(
  async (url: string) => fetchLinkPreview(url),
  ["studio-link-preview"],
  { revalidate: 60 * 60 * 24 },
);

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = typeof body.url === "string" ? safeParseUrl(body.url.trim()) : null;
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  return NextResponse.json(await cachedPreview(parsed.href));
}
