import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Phase 6 Plan 06-04: /api/health (RES-04, UI-SPEC §8d, RESEARCH §7).
 *
 * Public connectivity check — NO auth guard (monitoring tools must reach
 * it without credentials).
 *
 * Pings Supabase + Anthropic in parallel with per-service timeouts.
 * Google Calendar requires a per-user OAuth token; without user context
 * we can't ping it from a public endpoint — returns 'n/a' (RESEARCH §7).
 *
 * Response codes:
 *   - 200: supabase + anthropic both ok
 *   - 503: any required service down
 */
async function pingSupabase(): Promise<"ok" | "down"> {
  try {
    const supabase = await createClient();
    // Cheap connectivity check — public table query that respects RLS
    // (returns empty for unauthenticated session; an actual DOWN returns error).
    const { error } = await supabase.from("users").select("id").limit(1);
    return error ? "down" : "ok";
  } catch {
    return "down";
  }
}

async function pingAnthropic(): Promise<"ok" | "down"> {
  try {
    // Owner-system path (public health probe): uses the owner's
    // ANTHROPIC_API_KEY explicitly. No BYOK (there is no end-user here).
    const ownerKey = process.env.ANTHROPIC_API_KEY;
    if (!ownerKey) return "down";
    const client = new Anthropic({ apiKey: ownerKey });
    // models.list does NOT consume tokens — cheapest possible reachability check.
    await client.models.list();
    return "ok";
  } catch {
    return "down";
  }
}

function timeout<T>(ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
}

export async function GET() {
  const [supabaseStatus, anthropicStatus] = await Promise.all([
    Promise.race([pingSupabase(), timeout(3000, "down" as const)]),
    Promise.race([pingAnthropic(), timeout(5000, "down" as const)]),
  ]);

  const body = {
    supabase: supabaseStatus,
    anthropic: anthropicStatus,
    google_calendar: "n/a" as const,
    checked_at: new Date().toISOString(),
  };

  const allOk = supabaseStatus === "ok" && anthropicStatus === "ok";
  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
