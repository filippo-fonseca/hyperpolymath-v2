import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decideLandingRoute } from "@/lib/auth/routing";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_code", url));
  }

  const supabase = await createClient();
  const { data: exchangeData, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr || !exchangeData.user) {
    const msg = encodeURIComponent(exchangeErr?.message ?? "exchange_failed");
    return NextResponse.redirect(new URL(`/sign-in?error=${msg}`, url));
  }

  const userId = exchangeData.user.id;
  const rows = await db
    .select({ onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const landingPath = decideLandingRoute({ onboardedAt: rows[0]?.onboardedAt ?? null });
  return NextResponse.redirect(new URL(landingPath, url));
}
