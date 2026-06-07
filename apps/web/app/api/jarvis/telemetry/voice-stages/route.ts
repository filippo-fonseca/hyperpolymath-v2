/**
 * POST /api/jarvis/telemetry/voice-stages
 *
 * Phase 9 / TEL-01 client-side beacon endpoint. Back-fills the three
 * voice-pipeline-only timestamps that are observable ONLY in the browser:
 *
 *   - vad_end_at       — captured at JarvisListener onSpeechEnd
 *   - tts_first_byte_at — captured at useTtsPlayer first chunk arrival
 *   - audio_first_play_at — captured at AudioQueue first node.start()
 *
 * Auth: getClaims() — same pattern as /api/jarvis (CLAUDE.md §1).
 * Body: {turnId: string-uuid, vadEndAtMs?: number, ttsFirstByteAtMs?: number, audioFirstPlayAtMs?: number}
 *       — all timestamps optional so partial flushes (e.g. TTS failed before audio_first_play_at)
 *       still land the available data.
 *       Each timestamp is bounded:
 *         min: 1_700_000_000_000 (~Nov 2023, sane floor — rejects 0 / year-1970)
 *         max: Date.now() + 60_000 (one minute clock-skew tolerance — rejects year-3000 sentinels)
 *       The max is computed PER-REQUEST so the bound is always fresh.
 * WHERE: id = turnId AND user_id = claims.sub. Two-layer guard against
 *        spoofed turn_id (defense-in-depth atop RLS policy 0018).
 * Return: 204 on success, 401 unauth, 400 malformed, 200/204 on cross-tenant
 *         no-match (silent — UPDATE simply affects 0 rows, no leak of
 *         whether the turnId exists for another user).
 * Telemetry-never-breaks-flow: try/catch around the UPDATE; failures
 *         logged with console.error and return 204 (the beacon is
 *         fire-and-forget on the client; surfacing 5xx serves no purpose).
 *
 * Rate-limiting: NOT implemented in Phase 9. Single-user MVP, low write
 * volume (3 beacons per voice turn maximum, voice turns are minutes apart).
 * Deferred to Phase 14 (desktop-shell, where we have more control over
 * write volume) or a future hardening pass.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { jarvisEvents } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  // Upper bound computed PER-REQUEST inside the handler (not at module load)
  // so the bound stays fresh on long-lived serverless instances. .max(Date.now() + 60_000)
  const maxTs = Date.now() + 60_000;
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // Sane floor (~Nov 2023): .min(1_700_000_000_000) rejects 0 / year-1970 sentinels.
  const tsSchema = z.number().int().min(1_700_000_000_000).max(maxTs).optional();
  const BodySchema = z.object({
    turnId: z.string().uuid(),
    vadEndAtMs: tsSchema,
    ttsFirstByteAtMs: tsSchema,
    audioFirstPlayAtMs: tsSchema,
  });

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = BodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return new Response(`Invalid body: ${parsed.error.message}`, { status: 400 });
  }
  const { turnId, vadEndAtMs, ttsFirstByteAtMs, audioFirstPlayAtMs } = parsed.data;

  // Build a partial .set() payload — only include fields that were actually sent.
  // ALLOW-LIST: only these 3 columns may be set via this endpoint. RLS is
  // row-level; this is the application-layer column-level guard.
  const setPayload: Record<string, Date> = {};
  if (vadEndAtMs != null) setPayload.vadEndAt = new Date(vadEndAtMs);
  if (ttsFirstByteAtMs != null) setPayload.ttsFirstByteAt = new Date(ttsFirstByteAtMs);
  if (audioFirstPlayAtMs != null) setPayload.audioFirstPlayAt = new Date(audioFirstPlayAtMs);

  // No stages provided → 204 no-op (treat as accepted beacon, nothing to do).
  if (Object.keys(setPayload).length === 0) {
    return new Response(null, { status: 204 });
  }

  try {
    // Two-layer cross-tenant guard: eq(jarvisEvents.id, turnId) +
    // eq(jarvisEvents.userId, userId). RLS policy 0018 is the second layer.
    await db.update(jarvisEvents)
      .set(setPayload)
      .where(and(eq(jarvisEvents.id, turnId), eq(jarvisEvents.userId, userId)));
  } catch (err) {
    // Telemetry never breaks user flow (Phase 5 pattern).
    console.error("[voice-stages] UPDATE failed", err);
  }

  return new Response(null, { status: 204 });
}
