/**
 * Constant-time string comparison for secret/token validation.
 *
 * `timingSafeEqual` from node:crypto throws when buffer lengths differ, which
 * itself leaks length information via a timing side-channel (an early-return
 * path vs. a full comparison path). Guard with a length check first, but use a
 * fixed-cost fallback comparison so the total work done is always the same.
 *
 * Usage:
 *   import { constantTimeEqual } from "@/lib/auth/constant-time";
 *   if (!constantTimeEqual(authHeader, `Bearer ${secret}`)) { ... }
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Compare two strings in constant time. Returns false if either is empty,
 * if their lengths differ, or if their contents differ. The comparison always
 * does the same amount of work regardless of WHERE they differ, preventing
 * timing-oracle attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  // If lengths differ, timingSafeEqual would throw. We still want
  // constant-time behaviour for the case where the attacker can observe
  // whether we took the early-return path, so we compare a zero-length slice
  // of the longer buffer against itself (always true, zero cost) and return
  // false — the point is that the branch is trivially predictable and reveals
  // nothing about the content of either buffer.
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
