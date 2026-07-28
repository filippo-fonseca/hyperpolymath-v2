/**
 * Read helper for the per-user JARVIS-over-text settings plus last-reply
 * telemetry rendered by /settings#messaging (issue #352). Single source for the
 * row shape so the Server Component, the inbound webhook and any future surface
 * stay in sync.
 *
 * Mirrors lib/db/queries/pages-backup.ts.
 */

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Outcome of the last inbound text message this user's channel handled. */
export type SmsJarvisStatus = "done" | "disabled" | "ignored_sender" | "error";

export interface MessagingSettings {
  /**
   * When false the inbound webhook stops BEFORE spending a turn: no Anthropic
   * call, no reply, just a ledger row explaining the silence.
   */
  enabled: boolean;
  /** Last inbound handled (success OR failure), or null if never. */
  lastReplyAt: Date | null;
  /** Machine status of that attempt, or null if never. */
  lastStatus: SmsJarvisStatus | null;
  /** Human-readable detail when the last attempt errored; null otherwise. */
  lastError: string | null;
}

/**
 * Load the user's messaging settings. Defaults to DISABLED and never-run when
 * the row is somehow absent, so an unexpected miss fails closed rather than
 * opening an auto-replying channel.
 */
export async function getMessagingSettings(userId: string): Promise<MessagingSettings> {
  const rows = await db
    .select({
      enabled: users.smsJarvisEnabled,
      lastReplyAt: users.smsJarvisLastReplyAt,
      lastStatus: users.smsJarvisLastStatus,
      lastError: users.smsJarvisLastError,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  return {
    enabled: row?.enabled ?? false,
    lastReplyAt: row?.lastReplyAt ?? null,
    lastStatus: (row?.lastStatus as SmsJarvisStatus | null) ?? null,
    lastError: row?.lastError ?? null,
  };
}
