/**
 * Server-side resolver + mutations for per-user BYOK API keys.
 *
 * Every paid third-party call (Anthropic / Groq / ElevenLabs) goes through
 * `getUserKey` to fetch the caller's OWN key — there is no owner env fallback,
 * so a public user can never spend the owner's tokens. When a key is absent the
 * resolver throws `MissingKeyError`, which routes translate into a 402 with a
 * machine-readable `{ error: "key_missing", provider }` so the UI can flag the
 * feature inline.
 *
 * Reads/writes use the RLS-bypassing service-role db (the boundary is the
 * explicit userId filter here). Plaintext keys live only in memory.
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userApiKeys } from "@/lib/db/schema";
import { decryptApiKey, encryptApiKey } from "@/lib/crypto/byok";
import {
  type ByokProvider,
  BYOK_PROVIDERS,
  keyLast4,
} from "@/lib/byok/providers";

/** Thrown when a user has not configured the key required for a feature. */
export class MissingKeyError extends Error {
  readonly provider: ByokProvider;
  constructor(provider: ByokProvider) {
    super(`Missing ${provider} API key for user`);
    this.name = "MissingKeyError";
    this.provider = provider;
  }
}

/**
 * Returns the decrypted plaintext key for (user, provider), or null if absent.
 * Use this when absence is acceptable (e.g. probing which keys exist).
 */
export async function getUserKeyOrNull(
  userId: string,
  provider: ByokProvider,
): Promise<string | null> {
  const rows = await db
    .select({ keyEncrypted: userApiKeys.keyEncrypted })
    .from(userApiKeys)
    .where(
      and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)),
    )
    .limit(1);
  const enc = rows[0]?.keyEncrypted;
  if (!enc) return null;
  try {
    return decryptApiKey(enc);
  } catch {
    // Ciphertext unreadable (e.g. BYOK_ENC_KEY rotated). Treat as missing so the
    // user is prompted to re-enter rather than hitting an opaque 500.
    return null;
  }
}

/**
 * Returns the decrypted plaintext key for (user, provider), or throws
 * MissingKeyError. Use this at the start of a paid-call route handler.
 */
export async function getUserKey(
  userId: string,
  provider: ByokProvider,
): Promise<string> {
  const key = await getUserKeyOrNull(userId, provider);
  if (!key) throw new MissingKeyError(provider);
  return key;
}

/** Encrypts + upserts a user's key. Returns the last-4 fingerprint. */
export async function setUserKey(
  userId: string,
  provider: ByokProvider,
  plaintext: string,
): Promise<string> {
  const last4 = keyLast4(plaintext);
  const keyEncrypted = encryptApiKey(plaintext);
  await db
    .insert(userApiKeys)
    .values({ userId, provider, keyEncrypted, last4 })
    .onConflictDoUpdate({
      target: [userApiKeys.userId, userApiKeys.provider],
      set: { keyEncrypted, last4, updatedAt: new Date() },
    });
  return last4;
}

/** Deletes a user's key for a provider. */
export async function deleteUserKey(
  userId: string,
  provider: ByokProvider,
): Promise<void> {
  await db
    .delete(userApiKeys)
    .where(
      and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)),
    );
}

/** Which providers the user has configured — last4 only, never plaintext. */
export async function listUserKeyStatus(
  userId: string,
): Promise<Record<ByokProvider, { configured: boolean; last4: string | null }>> {
  const rows = await db
    .select({ provider: userApiKeys.provider, last4: userApiKeys.last4 })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
  const byProvider = new Map(rows.map((r) => [r.provider, r.last4]));
  const out = {} as Record<
    ByokProvider,
    { configured: boolean; last4: string | null }
  >;
  for (const provider of Object.keys(BYOK_PROVIDERS) as ByokProvider[]) {
    const last4 = byProvider.get(provider) ?? null;
    out[provider] = { configured: last4 !== null, last4 };
  }
  return out;
}
