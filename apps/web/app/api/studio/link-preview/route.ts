import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { safeParseUrl } from "@/lib/link-preview/classify";
import { fetchLinkPreview } from "@/lib/link-preview/fetch";

import { studioUserId } from "../_executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cachedPreview = unstable_cache(
  async (url: string) => fetchLinkPreview(url),
  ["studio-link-preview"],
  { revalidate: 60 * 60 * 24 }
);

export async function POST(request: Request): Promise<Response> {
  if (!(await studioUserId(request))) {
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
