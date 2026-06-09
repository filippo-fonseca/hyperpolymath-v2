/**
 * Bearer → userId resolver for the MCP route.
 *
 * Phase 999.12 MCP-03. We SHA-256 the incoming plaintext, look up the row by
 * hash in integration_tokens (provider='mcp_agent'), and return the owning
 * userId. The lookup is hash-keyed so the response time doesn't leak which
 * user a token belongs to — only "is this hash known."
 *
 * On a successful match we bump `updated_at` (the column doubles as
 * last_used_at for v1 — flagged in PRIVACY.md as a future migration).
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { MCP_PROVIDER } from "./mint-token";

type DB = typeof defaultDb;

export type VerifyResult = { ok: true; userId: string } | { ok: false };

export async function verifyBearer(
  plaintext: string,
  db: DB = defaultDb,
): Promise<VerifyResult> {
  // Defense in depth: reject obviously-malformed input before hitting the DB.
  // Our mint format is `mcp_<43-char base64url>` ≈ 47 chars; <16 is junk.
  if (!plaintext || plaintext.length < 16) return { ok: false };

  const hash = createHash("sha256").update(plaintext).digest("hex");
  const rows = await db
    .select({ userId: integrationTokens.userId })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.provider, MCP_PROVIDER),
        eq(integrationTokens.accessToken, hash),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false };

  // Bump updated_at as the "last used" timestamp. Fire-and-forget would lose
  // the error; we await so a DB failure surfaces and we don't return a stale
  // ok:true for a broken session.
  await db
    .update(integrationTokens)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(integrationTokens.userId, row.userId),
        eq(integrationTokens.provider, MCP_PROVIDER),
      ),
    );

  return { ok: true, userId: row.userId };
}
