import Groq from "groq-sdk";
import type { NextRequest } from "next/server";

import { emitPhysicalTranscript } from "@/lib/voice/physical-extension/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Trigger-Secret, X-Jarvis-Vad-End-At",
};

export async function POST(req: NextRequest): Promise<Response> {
  const expected = process.env.PHYSICAL_TRIGGER_SECRET;
  if (!expected) {
    return Response.json(
      { error: "PHYSICAL_TRIGGER_SECRET not configured on server" },
      { status: 500, headers: CORS },
    );
  }

  const provided = req.headers.get("x-trigger-secret");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const audioBuffer = await req.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return Response.json({ error: "Empty audio body" }, { status: 400, headers: CORS });
  }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio too large (max 25MB)" }, { status: 413, headers: CORS });
  }

  const vadEndAtHeader = req.headers.get("x-jarvis-vad-end-at");
  const vadEndAt = vadEndAtHeader ? Number(vadEndAtHeader) : undefined;

  const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });

  try {
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
    });
    const sttDoneAt = Date.now();
    emitPhysicalTranscript({
      transcript: transcription.text,
      sttDoneAt,
      vadEndAt: Number.isFinite(vadEndAt) ? (vadEndAt as number) : undefined,
      at: sttDoneAt,
    });
    return Response.json({ transcript: transcription.text, sttDoneAt }, { headers: CORS });
  } catch (err) {
    console.error("[voice/transcript] Groq failed", err);
    return Response.json({ error: "STT failed" }, { status: 500, headers: CORS });
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
