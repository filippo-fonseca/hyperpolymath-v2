/**
 * AES-256-GCM encryption for user-supplied (BYOK) third-party API keys.
 *
 * Going public means every user brings their OWN Anthropic / Groq / ElevenLabs
 * key — we never bill the owner's accounts for someone else's usage. Those keys
 * are secrets the user trusts us with, so they are encrypted at rest and the
 * plaintext only ever exists in memory during a single request.
 *
 * This mirrors lib/gcal/encryption.ts (same proven byte layout) but uses a
 * SEPARATE master key (BYOK_ENC_KEY) so the two trust domains rotate
 * independently — rotating the calendar key must not invalidate API keys and
 * vice-versa.
 *
 * Byte layout of the returned Buffer (stored as Postgres `bytea`):
 *
 *   ┌────────────┬────────────────┬──────────────────┐
 *   │ IV (12 B)  │ auth tag (16B) │ ciphertext (N B) │
 *   └────────────┴────────────────┴──────────────────┘
 *      offset 0       offset 12         offset 28
 *
 * Security boundary:
 *   - BYOK_ENC_KEY MUST be set (32 raw bytes, base64-encoded). getKey() throws
 *     otherwise — a silent fallback to a weak key would defeat the layer.
 *   - The plaintext key is NEVER written to the DB, logs, or the response body.
 *   - Rotating BYOK_ENC_KEY makes existing ciphertext unreadable; users simply
 *     re-enter their keys (correct behavior for a rotation event).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.BYOK_ENC_KEY;
  if (!raw) {
    throw new Error(
      "BYOK_ENC_KEY env var not set — required to encrypt user API keys. " +
        "Generate via: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `BYOK_ENC_KEY must decode to 32 bytes (256-bit AES-256-GCM key); got ${key.length} bytes`,
    );
  }
  return key;
}

/**
 * Encrypts a plaintext API key (UTF-8). Returns a packed Buffer:
 *   `iv (12B) || tag (16B) || ciphertext`. Store as Postgres `bytea`.
 */
export function encryptApiKey(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypts a packed Buffer produced by `encryptApiKey`. Throws if the auth tag
 * fails to verify (ciphertext/tag tampered, or wrong master key).
 */
export function decryptApiKey(packed: Buffer): string {
  const key = getKey();
  if (packed.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error(
      `encrypted API key shorter than minimum length (${IV_BYTES + TAG_BYTES + 1} bytes); got ${packed.length}`,
    );
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
