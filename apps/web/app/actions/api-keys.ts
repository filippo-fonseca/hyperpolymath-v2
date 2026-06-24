"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BYOK_PROVIDERS, type ByokProvider, isByokProvider } from "@/lib/byok/providers";
import { deleteUserKey, setUserKey } from "@/lib/byok/keys";

/**
 * Settings → API keys (BYOK). Lets a user enter, validate, and remove their own
 * Anthropic / Groq / ElevenLabs keys.
 *
 * Going public, the owner no longer ships these keys — each user supplies their
 * own and the server resolves it per-request (see lib/byok/keys.ts). These
 * actions are the write path; the crypto, DB table, and resolver already exist
 * and are not touched here.
 *
 * Security: the plaintext key is never logged or returned. Save responses carry
 * only the last-4 fingerprint that the resolver also stores.
 */

type SaveResult = { ok: true; last4: string } | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * CLAUDE.md Critical Pattern 1: validate via getClaims() (JWT signature
 * checked against Supabase's published keys), never getSession() in server code.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

/**
 * Cheap live probe to confirm a key is real before we store it. Returns:
 *   - "valid"   → provider accepted the key
 *   - "invalid" → provider returned 401/403 (key rejected)
 *   - "unknown" → network/transient error; caller saves anyway rather than
 *                 block on a flaky probe.
 */
async function probeKey(
  provider: ByokProvider,
  key: string,
): Promise<"valid" | "invalid" | "unknown"> {
  try {
    let res: Response;
    if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
    } else if (provider === "groq") {
      res = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
      });
    } else {
      res = await fetch("https://api.elevenlabs.io/v1/user", {
        method: "GET",
        headers: { "xi-api-key": key },
      });
    }
    if (res.status === 401 || res.status === 403) return "invalid";
    return "valid";
  } catch {
    // Network blip / DNS / timeout — not an auth rejection. Don't block.
    return "unknown";
  }
}

export async function saveApiKey(
  provider: string,
  plaintext: string,
): Promise<SaveResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };
  if (!isByokProvider(provider)) return { ok: false, error: "Unknown provider." };

  const key = plaintext.trim();
  if (!key) return { ok: false, error: "Enter a key first." };

  const meta = BYOK_PROVIDERS[provider];
  // Light prefix check only when the provider has a fixed prefix.
  if (meta.keyPrefix && !key.startsWith(meta.keyPrefix)) {
    return {
      ok: false,
      error: `That doesn't look like a ${meta.label} key (expected it to start with "${meta.keyPrefix}").`,
    };
  }

  const probe = await probeKey(provider, key);
  if (probe === "invalid") {
    return { ok: false, error: `That key was rejected by ${meta.label}.` };
  }

  const last4 = await setUserKey(userId, provider, key);
  revalidatePath("/settings");
  return { ok: true, last4 };
}

export async function deleteApiKey(provider: string): Promise<DeleteResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };
  if (!isByokProvider(provider)) return { ok: false, error: "Unknown provider." };

  await deleteUserKey(userId, provider);
  revalidatePath("/settings");
  return { ok: true };
}
