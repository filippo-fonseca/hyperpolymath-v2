/**
 * POST /api/jarvis/screenshot/describe — JARVIS "look at my screen" endpoint.
 *
 * Clicky slice: the desktop client executes the take_screenshot DesktopAction
 * (screencapture → PNG) and, when describe=true, POSTs the PNG here as
 * `{ png_base64: string }`. We call Claude (JARVIS_MODEL) with the image and
 * ask for a ONE-sentence, in-character butler description, then publish the
 * description over the physical SSE bus using the same
 * jarvis-response-start/chunk/end events run-turn's voice path emits — so the
 * desktop app speaks it through the normal TTS pipeline. The description is
 * also returned in the HTTP response for the caller.
 *
 * Auth (copied from /api/jarvis/tts — three accepted callers in priority order):
 *   a) Desktop app: Authorization: Bearer hpd_... (per-device token).
 *   b) ESP32 bridge: X-Trigger-Secret matching PHYSICAL_TRIGGER_SECRET.
 *   c) Browser: Supabase cookie via getClaims().
 *
 * BYOK: real users (desktop/browser) resolve their own Anthropic key; the
 * keyless trigger-secret path falls back to the owner env key (same pattern
 * as voice/transcript).
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import {
  getAnthropicClient,
  JARVIS_MODEL,
} from "@/lib/jarvis/anthropic-client";
import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
} from "@/lib/voice/physical-extension/bus";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Cap the DECODED image at ~8MB. base64 inflates 4/3, so the length check
// happens on the decoded estimate, not the raw string length.
const MAX_DECODED_BYTES = 8 * 1024 * 1024;

const DESCRIBE_SYSTEM_PROMPT =
  'You are JARVIS, the butler from the Iron Man films — dry, British, formal, concise. ' +
  'You are looking at a screenshot of the user\'s Mac screen. Describe what is on the screen ' +
  'in EXACTLY ONE short spoken sentence, in character, addressing the user as "sir". ' +
  "Name the foreground app or page and the one thing that matters most. " +
  "No lists, no IDs, no URLs read aloud, no preamble — just the single sentence.";

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Auth — same three-caller pattern as /api/jarvis/tts.
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

  // 2. Parse body
  let body: { png_base64?: unknown };
  try {
    body = (await req.json()) as { png_base64?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pngBase64 = typeof body.png_base64 === "string" ? body.png_base64.trim() : "";
  if (!pngBase64) {
    return Response.json({ error: "png_base64 is required" }, { status: 400 });
  }
  const approxDecodedBytes = Math.floor((pngBase64.length * 3) / 4);
  if (approxDecodedBytes > MAX_DECODED_BYTES) {
    return Response.json({ error: "Screenshot too large (max 8MB decoded)" }, { status: 413 });
  }

  // 3. BYOK — the user's own Anthropic key when there is a user identity;
  //    owner env fallback for the keyless trigger-secret path.
  const anthropicKey =
    (userId ? await getUserKeyOrNull(userId, "anthropic") : null) ??
    process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json({ error: "key_missing", provider: "anthropic" }, { status: 402 });
  }

  // 4. One-shot vision call — describe the screen in a single butler sentence.
  let description: string;
  try {
    const anth = getAnthropicClient(anthropicKey);
    const message = await anth.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 150,
      system: DESCRIBE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: pngBase64,
              },
            },
            { type: "text", text: "Describe my screen." },
          ],
        },
      ],
    });
    description = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join(" ")
      .trim();
  } catch (err) {
    console.error("[screenshot/describe] Anthropic vision call failed", err);
    return Response.json({ error: "Vision upstream failed" }, { status: 502 });
  }

  if (!description) {
    return Response.json({ error: "Empty description from model" }, { status: 502 });
  }

  // 5. Publish over the physical SSE bus exactly like run-turn's voice path
  //    (start → chunk → end) so the desktop speaks it via the normal TTS
  //    pipeline. One chunk carries the whole sentence — it's a single-shot
  //    description, not a token stream.
  const turnId = randomUUID();
  emitJarvisResponseStart({ turnId, at: Date.now() });
  emitJarvisResponseChunk({ turnId, delta: description, at: Date.now() });
  emitJarvisResponseEnd({ turnId, at: Date.now() });

  return Response.json({ ok: true, description });
}
