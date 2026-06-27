/**
 * POST /api/dev/trigger-autodev
 *
 * Manual trigger for the local kiwi-autodev worker. Writes a sentinel file at
 * $KIWI_AUTODEV_REPO/.kiwi-auto/.manual-trigger so the local LaunchAgent picks
 * it up. The launchd job polls every 30 minutes (StartInterval 1800), so the
 * run may be delayed up to 30 minutes unless WatchPaths is added to the plist
 * (see MANUAL WIRING below).
 *
 * MANUAL WIRING: for the trigger to fire the worker immediately rather than on
 * the next 30-minute poll, add a WatchPaths key to
 * tools/kiwi-autodev/com.hyperpolymath.kiwi-autodev.plist:
 *
 *   <key>WatchPaths</key>
 *   <array>
 *     <string>__REPO__/.kiwi-auto/.manual-trigger</string>
 *   </array>
 *
 * Then re-run tools/kiwi-autodev/install.sh to reload the agent.
 *
 * The worker reads run.mjs: it already skips the once-per-day lock when the
 * sentinel file is present (see the .manual-trigger check added to run.mjs).
 * The sentinel is deleted by the worker at the start of each triggered run.
 *
 * This route only works when the web server runs on the same machine as the
 * LaunchAgent (i.e. local dev). On Vercel the KIWI_AUTODEV_REPO env var will
 * be absent and the route returns 501 with a clear message.
 *
 * Auth: Supabase session (getClaims) + isOwnerUser check. Owner-only.
 * Rate-limited to 2 calls per 5 minutes.
 */

import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { isOwnerUser } from "@/lib/auth/owner";
import { checkRateLimit } from "@/lib/ratelimit/in-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  if (!(await isOwnerUser(userId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(`trigger-autodev:${userId}`, {
    limit: 2,
    windowMs: 5 * 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // KIWI_AUTODEV_REPO must be set to the absolute path of the repo on the local
  // machine. On Vercel this env var is absent (the worker is local-only).
  const repoRoot = process.env.KIWI_AUTODEV_REPO;
  if (!repoRoot) {
    return NextResponse.json(
      {
        ok: false,
        error: "local_only",
        detail:
          "KIWI_AUTODEV_REPO is not set. This trigger only works when the Next.js server runs on the same machine as the kiwi-autodev LaunchAgent. Set KIWI_AUTODEV_REPO=<absolute repo path> in apps/web/.env.local.",
      },
      { status: 501 },
    );
  }

  const sentinelPath = join(repoRoot, ".kiwi-auto", ".manual-trigger");
  try {
    await writeFile(sentinelPath, new Date().toISOString(), "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trigger-autodev] failed to write sentinel", msg);
    return NextResponse.json(
      { ok: false, error: "write_failed", detail: msg },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sentinelPath,
    note: "Sentinel written. The local LaunchAgent will pick it up on its next poll (up to 30 min). For immediate execution, add WatchPaths to the plist — see tools/kiwi-autodev/README.md.",
  });
}
