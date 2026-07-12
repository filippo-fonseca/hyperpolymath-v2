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

/**
 * Groq Orpheus TTS voice for the ElevenLabs fallback.
 *
 * Orpheus (canopylabs/orpheus-v1-english) ships six American-English personas:
 * males  → daniel, austin, troy
 * females→ autumn, diana, hannah
 * None is documented as British, so we keep "daniel": the calmest, most
 * measured male voice — the closest read to George's warm-butler register and
 * the one verified working (200 + valid WAV) on the current Groq key.
 * Alternatives if the timbre ever needs tweaking: "austin", "troy".
 */
const GROQ_TTS_VOICE = "daniel";

/**
 * Orpheus caps input at 200 characters per request. We truncate gracefully at a
 * sentence/word boundary so the fallback never 400s on a long sentence. TTS is
 * already fed a sentence at a time upstream, so this rarely bites.
 */
const GROQ_MAX_INPUT_CHARS = 200;

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

    console.log("[tts] served by elevenlabs");
    return new Response(readable, {
      headers: {
        "Content-Type": "application/octet-stream", // LAT-01: raw PCM bytes — no container, no codec
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // ElevenLabs failed. Before giving up (and forcing the desktop down to its
    // macOS `say` fallback), try Groq's Orpheus neural TTS. Groq returns a 16-bit
    // signed LE PCM @ 24 kHz mono WAV — the SAME sample format the desktop's
    // rodio path already consumes — so we strip the WAV container and hand back
    // raw PCM bytes on the identical application/octet-stream transport. The
    // desktop player can't tell which upstream produced the audio.
    console.error("[tts] ElevenLabs failed", err);
    const elevenLabsReason = classifyTtsError(err);

    const groqPcm = await tryGroqTts(text);
    if (groqPcm) {
      console.log("[tts] served by groq");
      return new Response(groqPcm as unknown as ArrayBuffer, {
        headers: {
          "Content-Type": "application/octet-stream", // raw 16-bit LE PCM @ 24kHz mono — matches ElevenLabs transport
          "X-Accel-Buffering": "no",
          "Cache-Control": "no-store",
        },
      });
    }

    // Both cloud voices failed. 502 (NOT 500) signals the client "upstream
    // failed, use the local fallback" (Pitfall 7). Include the machine-readable
    // ElevenLabs `reason` so the desktop can distinguish a dead/rejected key
    // (auth) from a transient blip; the local `say` fallback speaks regardless.
    console.error("[tts] both upstreams failed (elevenlabs + groq) — 502");
    return Response.json(
      { error: "TTS upstream failed", reason: elevenLabsReason },
      { status: 502 },
    );
  }
}

/**
 * Fallback TTS via Groq's Orpheus. Returns raw 16-bit signed LE PCM @ 24 kHz
 * mono (the WAV container stripped), matching the ElevenLabs transport, or null
 * on any failure (missing key, non-200, empty audio) so the caller can 502.
 *
 * Orpheus only emits WAV and caps input at 200 chars; we truncate at a boundary.
 */
async function tryGroqTts(text: string): Promise<Uint8Array | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || !groqKey.trim()) {
    console.warn("[tts] Groq fallback skipped — GROQ_API_KEY not set");
    return null;
  }

  const input = truncateForOrpheus(text);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "canopylabs/orpheus-v1-english",
        voice: GROQ_TTS_VOICE,
        input,
        response_format: "wav",
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[tts] Groq fallback failed: ${res.status} ${detail.slice(0, 200)}`);
      return null;
    }

    const wav = new Uint8Array(await res.arrayBuffer());
    const pcm = extractWavPcm(wav);
    if (!pcm || pcm.byteLength === 0) {
      console.error("[tts] Groq returned no PCM data");
      return null;
    }
    return pcm;
  } catch (groqErr) {
    console.error("[tts] Groq fallback threw", groqErr);
    return null;
  }
}

/**
 * Truncate to Orpheus's 200-char cap, preferring a sentence boundary, then a
 * word boundary, so the fallback never sounds cut off mid-word. Short input is
 * returned unchanged.
 */
function truncateForOrpheus(text: string): string {
  if (text.length <= GROQ_MAX_INPUT_CHARS) return text;
  const window = text.slice(0, GROQ_MAX_INPUT_CHARS);
  // Prefer the last sentence-ending punctuation within the window.
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (sentenceEnd > GROQ_MAX_INPUT_CHARS * 0.5) {
    return window.slice(0, sentenceEnd + 1).trim();
  }
  // Otherwise fall back to the last word boundary.
  const wordEnd = window.lastIndexOf(" ");
  return (wordEnd > 0 ? window.slice(0, wordEnd) : window).trim();
}

/**
 * Strip the WAV/RIFF container and return the raw PCM sample bytes.
 *
 * Groq streams the WAV with a placeholder data-chunk size of 0xFFFFFFFF and may
 * emit a LIST/INFO chunk before `data`, so we walk the chunk list to find the
 * `data` header and take everything after it to end-of-buffer (never trusting
 * the declared size). Assumes 16-bit mono 24 kHz PCM, which Orpheus produces and
 * the desktop rodio path consumes verbatim. Returns null if not a valid WAV.
 */
function extractWavPcm(wav: Uint8Array): Uint8Array | null {
  if (wav.byteLength < 12) return null;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  // "RIFF" .... "WAVE"
  if (view.getUint32(0, false) !== 0x52494646) return null; // 'RIFF'
  if (view.getUint32(8, false) !== 0x57415645) return null; // 'WAVE'

  let offset = 12;
  while (offset + 8 <= wav.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const declaredSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (chunkId === 0x64617461) {
      // 'data' — trust EOF over the (possibly streaming-placeholder) size.
      const end =
        declaredSize !== 0xffffffff && dataStart + declaredSize <= wav.byteLength
          ? dataStart + declaredSize
          : wav.byteLength;
      return wav.subarray(dataStart, end);
    }
    // Advance past this chunk (chunks are word-aligned: pad odd sizes by 1).
    offset = dataStart + declaredSize + (declaredSize & 1);
  }
  return null;
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
