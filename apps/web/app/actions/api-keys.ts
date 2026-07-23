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
    } else if (provider === "anthropic_admin") {
      // Admin keys authenticate against the org-scoped Admin API, not
      // /v1/messages. Probe the Cost API (the very endpoint the usage panel
      // calls) with a 1-day window so a workspace key with no admin scope is
      // rejected here rather than silently failing later.
      const startingAt = new Date();
      startingAt.setUTCDate(startingAt.getUTCDate() - 1);
      startingAt.setUTCHours(0, 0, 0, 0);
      const iso = startingAt.toISOString().replace(/\.\d{3}Z$/, "Z");
      res = await fetch(
        `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(iso)}&bucket_width=1d`,
        {
          method: "GET",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
        },
      );
    } else if (provider === "groq") {
      res = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
      });
    } else if (provider === "guardian") {
      res = await fetch(
        `https://content.guardianapis.com/search?api-key=${encodeURIComponent(key)}&q=test&page-size=1`,
        { method: "GET" },
      );
    } else if (provider === "govee") {
      res = await fetch("https://openapi.api.govee.com/router/api/v1/user/devices", {
        method: "GET",
        headers: { "Govee-API-Key": key },
      });
    } else if (provider === "elevenlabs") {
      res = await fetch("https://api.elevenlabs.io/v1/user", {
        method: "GET",
        headers: { "xi-api-key": key },
      });
      // ElevenLabs keys are permission-scoped. A key created just for TTS lacks
      // the user_read scope and gets 401 "missing_permissions" on /v1/user even
      // though it speaks fine — so don't reject those. Only a genuinely invalid
      // key (wrong/revoked secret) should be turned away here.
      if (res.status === 401 || res.status === 403) {
        let status = "";
        try {
          const body = (await res.json()) as { detail?: { status?: string } | string };
          status = typeof body.detail === "string" ? body.detail : (body.detail?.status ?? "");
        } catch {
          // No/!JSON body — can't tell scope from invalid; don't hard-block.
          return "unknown";
        }
        return status === "missing_permissions" ? "valid" : "invalid";
      }
      return "valid";
    } else {
      // Provider has no live probe yet — save without blocking.
      return "unknown";
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

  let last4: string;
  try {
    last4 = await setUserKey(userId, provider, key);
  } catch (err) {
    // Most likely BYOK_ENC_KEY is unset/misconfigured on the server, or a
    // transient DB error. Either way this must NOT escape the server action —
    // an uncaught throw here renders the whole /settings page into the error
    // boundary. Log the real cause server-side; return a safe inline message.
    console.error("[saveApiKey] failed to store key:", err);
    return {
      ok: false,
      error: "Couldn't save your key right now. Please try again in a moment.",
    };
  }
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
