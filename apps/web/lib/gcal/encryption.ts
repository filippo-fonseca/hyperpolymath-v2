/**
 * AES-256-GCM token encryption for Google Calendar refresh + access tokens.
 *
 * Phase 4 Plan 04-01 (D-05 revised): app-level encryption via node:crypto. The
 * key lives in env var GCAL_TOKEN_ENC_KEY (32 raw bytes, base64-encoded) and
 * NEVER crosses the database wire. Ciphertext is stored as `bytea` in
 * users.gcal_*_token_encrypted columns.
 *
 * Byte layout of the returned Buffer:
 *
 *   ┌────────────┬────────────────┬──────────────────┐
 *   │ IV (12 B)  │ auth tag (16B) │ ciphertext (N B) │
 *   └────────────┴────────────────┴──────────────────┘
 *      offset 0       offset 12         offset 28
 *
 * Why these sizes:
 *   - 96-bit IV (12 B) is the NIST SP 800-38D recommendation for GCM — shorter
 *     than the AES block size, faster to generate, and standard for SSL/TLS.
 *   - 128-bit auth tag (16 B) is the maximum and what gcm modes default to.
 *
 * Why sync (not async):
 *   - node:crypto's sync API is the actually-implemented surface for these
 *     primitives. Async helpers in the research doc were aspirational — using
 *     `async` here creates false expectations of cancellation / await chains
 *     and forces every caller (token.ts, future Settings page Server Actions)
 *     to thread `await` for no benefit.
 *
 * Security boundary:
 *   - GCAL_TOKEN_ENC_KEY MUST be set before any call. getKey() throws a clear
 *     error otherwise — silent fallback to a weak key would defeat the layer.
 *   - The key MUST be exactly 32 bytes after base64 decode (AES-256).
 *   - Rotate the key by generating a new one + re-running the OAuth flow for
 *     all connected users (their stored refresh tokens become unreadable, but
 *     that's the correct behavior for a key rotation event).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.GCAL_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      "GCAL_TOKEN_ENC_KEY env var not set — required for gcal token encryption. " +
        "Generate via: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GCAL_TOKEN_ENC_KEY must decode to 32 bytes (256-bit AES-256-GCM key); got ${key.length} bytes`,
    );
  }
  return key;
}

/**
 * Encrypts a plaintext token (UTF-8). Returns a packed Buffer:
 *   `iv (12B) || tag (16B) || ciphertext`.
 *
 * Store as Postgres `bytea`. Decryption parses the prefix back out.
 */
export function encryptToken(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypts a packed Buffer produced by `encryptToken`. Throws if the auth tag
 * fails to verify (i.e., the ciphertext or tag has been tampered with).
 */
export function decryptToken(packed: Buffer): string {
  const key = getKey();
  if (packed.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error(
      `gcal encrypted token shorter than minimum length (${IV_BYTES + TAG_BYTES + 1} bytes); got ${packed.length}`,
    );
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
