/**
 * POST /api/jarvis/stt — Groq Whisper STT proxy.
 *
 * Phase 7 Plan 07-01 Task 2.
 *
 * Receives a raw WAV audio body from JarvisListener (encoded by
 * lib/voice/encode-wav.ts), forwards to Groq Whisper large-v3-turbo,
 * returns { transcript: string }.
 *
 * Auth pattern is identical to /api/jarvis/route.ts (getClaims, NOT
 * getSession — per CLAUDE.md Critical Pattern 1).
 *
 * Error handling:
 *   - 401: unauthenticated (getClaims returns null)
 *   - 400: empty body
 *   - 413: body > 25MB (Pitfall 8 server-side belt; client cap is the suspenders)
 *   - 500: Groq upstream failure (error details NOT leaked to client)
 */

import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { getUserKey, MissingKeyError } from "@/lib/byok/keys";

export const runtime = "nodejs"; // NOT Edge — groq-sdk uses Node streams

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB Groq cap (Pitfall 8 server belt)

export async function POST(req: Request): Promise<Response> {
  // 1. Auth (same pattern as /api/jarvis route — getClaims() per CLAUDE.md §1)
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  // 1b. BYOK — resolve the user's own Groq key. No owner env fallback.
  let groqKey: string;
  try {
    groqKey = await getUserKey(userId, "groq");
  } catch (e) {
    if (e instanceof MissingKeyError) {
      return Response.json(
        { error: "key_missing", provider: "groq" },
        { status: 402 },
      );
    }
    throw e;
  }
  const groq = new Groq({ apiKey: groqKey });

  // 2. Read audio body (Content-Type: audio/wav from encode-wav helper)
  const audioBuffer = await req.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return Response.json({ error: "Empty audio body" }, { status: 400 });
  }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio too large (max 25MB)" }, { status: 413 });
  }

  // 3. Wrap as File for Groq SDK
  const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });

  // 4. Call Groq Whisper large-v3-turbo (HTTP-only per RESEARCH; ~80ms for 5s clip)
  try {
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
    });
    // Phase 9 / TEL-01: capture stt_done_at at the LAST possible server moment
    // (transcript ready, about to return) and round-trip it through a response
    // header. JarvisListener reads it and forwards as X-Jarvis-Stt-Done-At on
    // the subsequent /api/jarvis POST, where the route stamps it into
    // stages.sttDoneAt on the jarvis_events row. Header value is epoch ms.
    const sttDoneAtMs = Date.now();
    return Response.json(
      { transcript: transcription.text },
      {
        headers: {
          "x-jarvis-stt-done-at": String(sttDoneAtMs),
        },
      },
    );
  } catch (err) {
    // Do NOT leak Groq error details to client (could expose API key in stack)
    console.error("[stt] Groq failed", err);
    return Response.json({ error: "STT failed" }, { status: 500 });
  }
}
