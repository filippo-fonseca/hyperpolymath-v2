/**
 * POST /api/jarvis/tts — ElevenLabs Flash TTS streaming proxy.
 *
 * Phase 7 Plan 07-01 Task 3 (original MP3 transport).
 * Phase 10 Plan 10-03 Task 1 (LAT-01) — switched to raw 16-bit signed LE
 * PCM @ 24kHz mono via output_format=pcm_24000. Same ElevenLabs voice and
 * synthesis; only transport encoding differs. PCM removes the per-chunk
 * decodeAudioData tax on the client (~15-30ms) and is frame-aligned
 * trivially (2 bytes/sample) so arbitrary-size chunks flow gaplessly.
 *
 * Accepts { text: string, voiceId?: string }, opens an ElevenLabs
 * convertAsStream session for the given (or default) voice, and streams
 * the resulting raw 16-bit PCM bytes (24kHz mono, signed LE) per LAT-01
 * (Phase 10) back to the client via a ReadableStream.
 *
 * Returns 502 (NOT 500) on ElevenLabs failure — the 502 status signals to
 * the client "upstream failed; use SpeechSynthesis fallback" (Pitfall 7).
 *
 * Auth:
 *   - Browser path: getClaims() (Supabase cookie JWT — per CLAUDE.md).
 *   - Desktop path: X-Trigger-Secret header (same secret used by
 *     voice/transcript and physical/trigger). Desktop can't hold a cookie
 *     session, so it reuses the shared daemon secret already in env.
 *     The two paths are mutually exclusive — X-Trigger-Secret is only set
 *     by the desktop process, never by the browser.
 */

import { ElevenLabsClient } from "elevenlabs";
import { createClient } from "@/lib/supabase/server";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { DEFAULT_VOICE_ID } from "@/lib/voice/constants";
import type { TtsRequest } from "@/lib/voice/types";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TEXT_LEN = 5000;

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Auth — three accepted callers in priority order:
  //   a) Desktop app: Authorization: Bearer hpd_... (per-device token).
  //   b) ESP32 bridge: X-Trigger-Secret matching PHYSICAL_TRIGGER_SECRET.
  //   c) Browser: Supabase cookie via getClaims().
  //
  // We also capture the resolved userId (desktop token or browser claims) so
  // BYOK can resolve that user's own ElevenLabs key. The ESP32 trigger-secret
  // path has NO user (owner-only physical hardware) → owner env fallback.
  const desktopUserId = await validateDesktopBearer(req);
  let userId: string | null = desktopUserId;
  if (!desktopUserId) {
    const triggerSecret = req.headers.get("x-trigger-secret");
    if (triggerSecret) {
      const expected = process.env.PHYSICAL_TRIGGER_SECRET;
      if (!expected || triggerSecret !== expected) {
        return new Response("Unauthorized", { status: 401 });
      }
    } else {
      const supabase = await createClient();
      const claimsResult = await supabase.auth.getClaims();
      if (claimsResult.error || !claimsResult.data?.claims?.sub) {
        return new Response("Unauthorized", { status: 401 });
      }
      userId = claimsResult.data.claims.sub;
    }
  }

  // 1b. BYOK — resolve the TTS key. Priority: the user's own ElevenLabs key,
  //     else the owner's env key. The owner (desktop / voice-everywhere is
  //     owner-only) always falls back to ELEVENLABS_API_KEY so a fresh install
  //     works with no key configured in-app; the keyless ESP32 trigger-secret
  //     path likewise uses env. A non-owner browser user with no key still
  //     gets 402 — env keys bill the owner, never a public user.
  let elevenLabsKey: string | undefined;
  if (userId) {
    elevenLabsKey =
      (await getUserKeyOrNull(userId, "elevenlabs")) ??
      ((await isOwnerUser(userId)) ? process.env.ELEVENLABS_API_KEY : undefined);
    if (!elevenLabsKey) {
      return Response.json(
        { error: "key_missing", provider: "elevenlabs" },
        { status: 402 },
      );
    }
  } else {
    elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  }
  // Prod currently ships an EMPTY ELEVENLABS_API_KEY, so the owner/trigger path
  // resolves to "" here. Treat an empty/whitespace key as key_missing up front
  // (machine-readable reason) instead of letting an empty-key request fall into
  // the generic 502 below — the desktop uses this to pick its local-voice
  // fallback and label the "voice degraded" indicator correctly.
  if (!elevenLabsKey || !elevenLabsKey.trim()) {
    return Response.json(
      { error: "key_missing", provider: "elevenlabs", reason: "key_missing" },
      { status: 502 },
    );
  }
  const client = new ElevenLabsClient({ apiKey: elevenLabsKey });

  // 2. Parse body
  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Empty text" }, { status: 400 });
  if (text.length > MAX_TEXT_LEN) {
    return Response.json({ error: "Text too long" }, { status: 413 });
  }

  const voiceId = body.voiceId ?? DEFAULT_VOICE_ID;

  // 3. Open ElevenLabs stream
  try {
    const audioStream = await client.textToSpeech.convertAsStream(voiceId, {
      text,
      model_id: "eleven_flash_v2_5",
      output_format: "pcm_24000", // LAT-01: raw 16-bit signed LE @ 24kHz mono, no decodeAudioData tax
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    // 4. Pipe to client as chunked stream
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of audioStream) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (err) {
          console.error("[tts] stream interrupted", err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/octet-stream", // LAT-01: raw PCM bytes — no container, no codec
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // 502 (NOT 500) signals to client "upstream failed, use fallback" (Pitfall 7).
    // Include a machine-readable `reason` so the desktop can distinguish a
    // dead/rejected key (auth — a fresh key must be minted) from a transient
    // upstream blip (transient — worth a later retry). Both still fall back to
    // local speech client-side, but the reason drives the "voice degraded"
    // copy and any future retry policy.
    console.error("[tts] ElevenLabs failed", err);
    const reason = classifyTtsError(err);
    return Response.json({ error: "TTS upstream failed", reason }, { status: 502 });
  }
}

/** Machine-readable failure reason for the 502 body. */
type TtsFailureReason = "auth" | "transient";

/**
 * Best-effort classification of an ElevenLabs SDK error into auth vs transient.
 * The SDK surfaces an HTTP `statusCode` on its errors; 401/403 (and 400 with an
 * invalid-key body) mean the key is dead, everything else is treated as a
 * transient upstream failure.
 */
function classifyTtsError(err: unknown): TtsFailureReason {
  const status =
    (err as { statusCode?: number; status?: number } | null)?.statusCode ??
    (err as { statusCode?: number; status?: number } | null)?.status;
  if (status === 401 || status === 403) return "auth";
  const message = String((err as { message?: unknown } | null)?.message ?? "").toLowerCase();
  if (
    message.includes("unauthorized") ||
    message.includes("invalid api key") ||
    message.includes("invalid_api_key") ||
    message.includes("api_key")
  ) {
    return "auth";
  }
  return "transient";
}
