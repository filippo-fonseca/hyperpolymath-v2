import { ElevenLabsClient } from "elevenlabs";
import { DEFAULT_VOICE_ID } from "@/lib/voice/constants";
import { checkRateLimit } from "@/lib/ratelimit/in-memory";

/**
 * Derive the client IP from proxy headers. `x-forwarded-for` may be a
 * comma-separated list (client, proxy1, proxy2…); the first entry is the
 * original client. Falls back to `x-real-ip`, then a shared "unknown" bucket.
 */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Public landing-page TTS demo. Unauthenticated, so abuse vectors must be
 * closed by construction — not by trust:
 *
 *   - Server is the only source of truth for the line text. The client sends
 *     an integer index; an attacker cannot feed arbitrary text into our
 *     ElevenLabs key.
 *   - Each generated MP3 is cached in module memory (`cache` Map) keyed by
 *     line index, so ElevenLabs is hit at most once per line per server
 *     lifetime. Subsequent requests stream from the cached Buffer.
 *   - 502 on upstream failure mirrors /api/jarvis/tts so the client can fall
 *     back to SpeechSynthesis with the same text (returned in the response
 *     body for that case).
 */

export const DEMO_LINES: readonly string[] = [
  "Greetings. You appear to have summoned me from a marketing page. Bold of you.",
  "Hello. I am the orchestrator. Try not to give me any feelings, I'm rather bad at those.",
  "If you are wondering whether the voice is real: yes. If you are wondering whether it is always this composed: also yes.",
  "Hyperpolymath is the system. I am the bird inside it. Pleased to meet you.",
  "I am Kiwi. Some people call me JARVIS. I answer to both, with subtle disappointment.",
  "I will not invent a tool that doesn't exist, nor pretend to know what I don't. I find both rather rude.",
];

const cache = new Map<number, Buffer>();

let client: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient | null {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  if (!client) {
    client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return client;
}

export async function POST(req: Request): Promise<Response> {
  // Rate-limit BEFORE any upstream call so blocked requests never spend the
  // owner's paid ElevenLabs tokens. Best-effort, per-instance (see limiter).
  const ip = clientIp(req);
  const burst = checkRateLimit(`landing-demo:burst:${ip}`, {
    limit: 8,
    windowMs: 60_000,
  });
  const daily = burst.ok
    ? checkRateLimit(`landing-demo:daily:${ip}`, {
        limit: 40,
        windowMs: 24 * 60 * 60_000,
      })
    : burst;
  const gate = burst.ok ? daily : burst;
  if (!gate.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfterSec) },
      },
    );
  }

  let body: { lineId?: number };
  try {
    body = (await req.json()) as { lineId?: number };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lineId = body.lineId;
  if (
    typeof lineId !== "number" ||
    !Number.isInteger(lineId) ||
    lineId < 0 ||
    lineId >= DEMO_LINES.length
  ) {
    return Response.json({ error: "Invalid lineId" }, { status: 400 });
  }

  const text = DEMO_LINES[lineId]!;

  // Cached → stream the Buffer directly.
  const cached = cache.get(lineId);
  if (cached) {
    return new Response(new Uint8Array(cached), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Demo-Line": String(lineId),
      },
    });
  }

  const eleven = getClient();
  if (!eleven) {
    // No key configured — tell client to use SpeechSynthesis with this text.
    return Response.json({ fallback: true, text }, { status: 502 });
  }

  try {
    const audioStream = await eleven.textToSpeech.convertAsStream(
      DEFAULT_VOICE_ID,
      {
        text,
        model_id: "eleven_flash_v2_5",
        output_format: "mp3_44100_128",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
    );

    // Buffer the full MP3 — same frame-alignment concern as /api/jarvis/tts.
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk as Uint8Array);
    }
    const full = Buffer.concat(chunks);
    cache.set(lineId, full);

    return new Response(new Uint8Array(full), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Demo-Line": String(lineId),
      },
    });
  } catch (err) {
    console.error("[landing/jarvis-demo] ElevenLabs failed", err);
    return Response.json({ fallback: true, text }, { status: 502 });
  }
}

// Expose the line catalog at GET so the client can pick an index without
// hard-coding the count. Texts are also returned so the SpeechSynthesis
// fallback has something to read aloud when ElevenLabs is unavailable.
export async function GET(): Promise<Response> {
  return Response.json({ count: DEMO_LINES.length, lines: DEMO_LINES });
}
