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
 * Auth pattern identical to /api/jarvis/route.ts (getClaims).
 */

import { ElevenLabsClient } from "elevenlabs";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_VOICE_ID } from "@/lib/voice/constants";
import type { TtsRequest } from "@/lib/voice/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TEXT_LEN = 5000;

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

export async function POST(req: Request): Promise<Response> {
  // 1. Auth (getClaims() per CLAUDE.md Critical Pattern 1)
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }

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
    // 502 (NOT 500) signals to client "upstream failed, use fallback" (Pitfall 7)
    console.error("[tts] ElevenLabs failed", err);
    return Response.json({ error: "TTS upstream failed" }, { status: 502 });
  }
}
