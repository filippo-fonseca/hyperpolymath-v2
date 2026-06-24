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

  // Provision the public.users row right after OAuth, independent of the
  // auth.users trigger (migration 0002). Idempotent — onConflictDoNothing makes
  // repeat sign-ins and a present trigger both safe — so a new user always has a
  // row before the first authed page load.
  await db
    .insert(users)
    .values({ id: userId, email: exchangeData.user.email ?? "" })
    .onConflictDoNothing();

  const rows = await db
    .select({ onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const landingPath = decideLandingRoute({ onboardedAt: rows[0]?.onboardedAt ?? null });
  return NextResponse.redirect(new URL(landingPath, url));
}
