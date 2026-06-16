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

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { headers } from "next/headers";
import { z } from "zod";

const WaitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  note: z.string().trim().max(280).optional(),
  // Honeypot — real users never see this (offscreen in the form). Validate it
  // as a permissive optional string (bounded for safety) so a bot filling it
  // still PARSES; the dedicated honeypot check below short-circuits to a silent
  // success. A `.max(0)` here would make a tripped honeypot fail parse and fall
  // into the "Invalid email." branch, leaking that the bot was caught and never
  // reaching the silent-success path.
  website: z.string().max(320).optional(),
});

export type JoinWaitlistInput = z.input<typeof WaitlistSchema>;
export type JoinWaitlistResult = { success: true } | { success: false; error: string };

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
  const history = (ipBucket.get(hashedIp) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (history.length >= RATE_LIMIT) return false;
  history.push(now);
  ipBucket.set(hashedIp, history);
  return true;
}

export async function joinWaitlist(input: unknown): Promise<JoinWaitlistResult> {
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
    const note = parsed.data.note?.length ? parsed.data.note : undefined;
    const insert = db.insert(waitlist).values({
      email: parsed.data.email,
      note,
      submittedIp: hashedIp,
    });
    if (note) {
      // A note arrived (the "what do you do?" follow-up). The email row may
      // already exist from the first submit, so persist the note on conflict
      // instead of silently dropping it (plain onConflictDoNothing would lose
      // the answer). Idempotent: re-running with the same note is a no-op.
      await insert.onConflictDoUpdate({
        target: waitlist.email,
        set: { note },
      });
    } else {
      // First submit (email only) — idempotent, no leakage on re-submit.
      await insert.onConflictDoNothing({ target: waitlist.email });
    }
    return { success: true };
  } catch (e) {
    console.error("[waitlist] insert failed:", e);
    return {
      success: false,
      error: "Couldn't reach the list. Try again, or email filippo directly.",
    };
  }
}
