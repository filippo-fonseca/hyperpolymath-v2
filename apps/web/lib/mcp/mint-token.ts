/**
 * MCP bearer-token mint + revoke helpers.
 *
 * Phase 999.12 MCP-03 / MCP-05. Mirrors the desktop_devices "hash at rest;
 * plaintext returned exactly once at mint" pattern, but reuses
 * integration_tokens (composite PK on (user_id, provider)) instead of a new
 * table because the storage shape is identical and CONTEXT.md locks this.
 *
 * v1 limit: ONE mcp_agent token per user. Re-mint overwrites the prior row.
 * Surface this in /settings/mcp-tokens copy (Plan 05) so the user knows that
 * minting a second device's token invalidates the first device.
 *
 * Storage shortcut: the user-supplied label (e.g., "Claude Desktop on Mac")
 * lives in `integration_tokens.refresh_token` for v1 — we don't want an
 * additive migration just for a name column. Flagged in PRIVACY.md and in
 * the phase SUMMARY as a future migration target.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { type Result, ok, err } from "@/lib/integrations/result";

export const MCP_PROVIDER = "mcp_agent" as const;

type DB = typeof defaultDb;

/**
 * Mint a new MCP bearer token. The plaintext is returned ONCE — the caller is
 * responsible for showing it to the user immediately and never persisting it
 * server-side. Only the SHA-256 hash lives in the DB.
 *
 * `name` is the user-supplied label ("Claude Desktop on Mac"). Stored in the
 * refresh_token column for v1 (see file header note).
 */
export async function mintMcpToken(
  userId: string,
  name: string,
  db: DB = defaultDb,
): Promise<Result<{ plaintext: string; hash: string }>> {
  try {
    const plaintext = `mcp_${randomBytes(32).toString("base64url")}`;
    const hash = createHash("sha256").update(plaintext).digest("hex");
    await db
      .insert(integrationTokens)
      .values({
        userId,
        provider: MCP_PROVIDER,
        accessToken: hash,
        refreshToken: name,
        expiresAt: null,
      })
      .onConflictDoUpdate({
        target: [integrationTokens.userId, integrationTokens.provider],
        set: {
          accessToken: hash,
          refreshToken: name,
          updatedAt: new Date(),
        },
      });
    return ok({ plaintext, hash });
  } catch (e) {
    return err(e instanceof Error ? e.message : "mintMcpToken failed");
  }
}

/**
 * Revoke (delete) the user's mcp_agent token row. No-op if none exists.
 */
export async function revokeMcpToken(
  userId: string,
  db: DB = defaultDb,
): Promise<Result<void>> {
  try {
    await db
      .delete(integrationTokens)
      .where(
        and(
          eq(integrationTokens.userId, userId),
          eq(integrationTokens.provider, MCP_PROVIDER),
        ),
      );
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "revokeMcpToken failed");
  }
}
