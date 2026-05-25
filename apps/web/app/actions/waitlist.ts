"use server";

/**
 * Waitlist Server Action — Phase 8 (LAND-WAITLIST / D-12).
 *
 * Anonymous email capture from the public landing manifesto. The REAL security
 * boundary (Drizzle pooler bypasses RLS — see 08-RESEARCH.md §Pitfall 5):
 *   1. Zod validation (bounded email, bounded note, honeypot field)
 *   2. Honeypot — bots fill all fields, real humans never see `website`
 *   3. Per-IP rate limit — 5 submits/hour, in-memory Map (resets per function instance)
 *   4. ON CONFLICT (email) DO NOTHING — idempotent on re-submit, no leakage
 *
 * Does NOT authenticate (no getClaims / no createClient) — endpoint is intentionally anonymous.
 * Hashed IP (sha256 first 16 chars) written for triage; never raw IP.
 */

import { z } from "zod";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";

const WaitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  note: z.string().trim().max(280).optional(),
  // Honeypot — must be empty. Real users never see this (display:none in form).
  website: z.string().max(0).optional(),
});

export type JoinWaitlistInput = z.input<typeof WaitlistSchema>;
export type JoinWaitlistResult =
  | { success: true }
  | { success: false; error: string };

// In-memory IP bucket — survives within one serverless function instance.
// Stronger throttle (v2): persist to Supabase + check count cross-instance.
const ipBucket = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT = 5; // 5 submits/IP/hour

async function getHashedIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function checkRateLimit(hashedIp: string): boolean {
  const now = Date.now();
  const history = (ipBucket.get(hashedIp) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (history.length >= RATE_LIMIT) return false;
  history.push(now);
  ipBucket.set(hashedIp, history);
  return true;
}

export async function joinWaitlist(
  input: unknown,
): Promise<JoinWaitlistResult> {
  const parsed = WaitlistSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid email." };
  }
  // Honeypot tripped → silent success (don't let bots know they were caught)
  if (parsed.data.website && parsed.data.website.length > 0) {
    return { success: true };
  }

  const hashedIp = await getHashedIp();
  if (!checkRateLimit(hashedIp)) {
    return {
      success: false,
      error: "Too many submissions. Try again in an hour.",
    };
  }

  try {
    await db
      .insert(waitlist)
      .values({
        email: parsed.data.email,
        note: parsed.data.note,
        submittedIp: hashedIp,
      })
      .onConflictDoNothing({ target: waitlist.email });
    return { success: true };
  } catch (e) {
    console.error("[waitlist] insert failed:", e);
    return {
      success: false,
      error:
        "Couldn't reach the list. Try again, or email filippo directly.",
    };
  }
}
