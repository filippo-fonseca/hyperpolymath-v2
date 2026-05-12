/**
 * AES-256-GCM round-trip + tamper detection for the gcal token encryption layer
 * (Phase 4 Plan 04-01, D-05 revised: app-level encryption via node:crypto, NOT pgcrypto).
 *
 * The contract this pins:
 *   - encryptToken returns a Buffer with layout `iv (12B) || tag (16B) || ciphertext`.
 *   - decryptToken(encryptToken(s)) === s for ASCII + Unicode + 1KB inputs.
 *   - A 1-byte flip in either the auth tag or ciphertext throws on decrypt
 *     (this is the whole point of GCM — without auth-tag verification we'd just
 *     have AES-CTR with no integrity guarantee, and an attacker could flip
 *     plaintext bits arbitrarily).
 *   - Missing or wrong-length GCAL_TOKEN_ENC_KEY surfaces a clear error
 *     (silent fallback to a weak key is a security trap).
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const IV_BYTES = 12;
const TAG_BYTES = 16;

// Generate a fresh 32-byte key per test run. Keeping the key out of the source tree
// avoids tripping secret-scanners (gitleaks) and proves the encryption module reads
// the env var at call time rather than baking in a constant.
const TEST_KEY_B64 = randomBytes(32).toString("base64");

// Mutate the env BEFORE importing the module under test — getKey() reads it at call
// time, so as long as it's set when encrypt/decrypt run, we're fine.
beforeAll(() => {
  process.env.GCAL_TOKEN_ENC_KEY = TEST_KEY_B64;
});

describe("gcal encryption — AES-256-GCM round-trip + tamper detection", () => {
  it("encryptToken returns a Buffer with `iv (12B) || tag (16B) || ciphertext` layout", async () => {
    const { encryptToken } = await import("@/lib/gcal/encryption");
    const packed = encryptToken("plain-text-token");
    expect(Buffer.isBuffer(packed)).toBe(true);
    // At minimum 12 (IV) + 16 (tag) + N>=1 (ciphertext) bytes.
    expect(packed.length).toBeGreaterThan(IV_BYTES + TAG_BYTES);
  });

  it("decryptToken(encryptToken(plaintext)) === plaintext for ASCII + Unicode + 1KB strings", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/gcal/encryption");
    const cases = [
      "ya29.a0AfH6SMC_short_ascii_token",
      "ünîcôdé-Ω-π-emoji-🥝-and-more",
      "x".repeat(1024),
    ];
    for (const plaintext of cases) {
      const packed = encryptToken(plaintext);
      expect(decryptToken(packed)).toBe(plaintext);
    }
  });

  it("decryptToken throws when the ciphertext bytes are tampered (1-byte flip after IV+tag)", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/gcal/encryption");
    const packed = encryptToken("integrity-matters");
    // Flip a byte INSIDE the ciphertext (index 30 sits past IV[0..11] + tag[12..27]).
    const tampered = Buffer.from(packed);
    tampered[30] = tampered[30]! ^ 0xff;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("decryptToken throws when the auth tag bytes are tampered (1-byte flip in tag region)", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/gcal/encryption");
    const packed = encryptToken("integrity-matters");
    // Flip a byte inside the auth tag (index 12 = first tag byte).
    const tampered = Buffer.from(packed);
    tampered[12] = tampered[12]! ^ 0x01;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("encryptToken throws a clear error when GCAL_TOKEN_ENC_KEY is missing or wrong length", async () => {
    const { encryptToken } = await import("@/lib/gcal/encryption");
    const saved = process.env.GCAL_TOKEN_ENC_KEY;

    // Case 1: missing
    delete process.env.GCAL_TOKEN_ENC_KEY;
    expect(() => encryptToken("anything")).toThrow(/GCAL_TOKEN_ENC_KEY/);

    // Case 2: wrong length (16 bytes instead of 32)
    process.env.GCAL_TOKEN_ENC_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptToken("anything")).toThrow(/32 bytes/);

    // Restore
    process.env.GCAL_TOKEN_ENC_KEY = saved;
  });
});

afterAll(() => {
  // Leave the test key in place — other suites in the same vitest worker may need it.
});
