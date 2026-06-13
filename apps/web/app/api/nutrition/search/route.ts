/**
 * GET /api/nutrition/search?q=banana
 *
 * Proxies to OpenFoodFacts Search-a-licious endpoint with the required
 * User-Agent and returns a typed { hits: NormalizedOffProduct[] } response.
 *
 * Auth: requireOnboarded() (must be logged in + onboarded).
 * Cache: 5 minutes via off-client.ts (next: { revalidate: 300 }).
 *
 * Returns 200 { hits: [] } for empty or too-short queries (no 400 — caller
 * decides how to debounce).
 * Returns 502 if the upstream OFF call fails.
 */

import { NextResponse } from "next/server";
import { requireOnboarded } from "@/lib/auth/get-user";
import { offSearch } from "@/lib/nutrition/off-client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Auth gate — requireOnboarded redirects to /sign-in or /onboarding if needed
  await requireOnboarded();

  const q = new URL(req.url).searchParams.get("q");

  // Minimum query length guard — return empty hits rather than hitting OFF
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ hits: [], count: 0 });
  }

  try {
    const result = await offSearch(q.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/nutrition/search] OFF upstream error:", err);
    return NextResponse.json(
      { hits: [], count: 0, error: String(err) },
      { status: 502 },
    );
  }
}
