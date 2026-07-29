/**
 * /settings/mcp-tokens — MCP bearer-token management for external agents.
 *
 * Phase 999.12 Plan 05 / MCP-05. Lets the user mint, view, and revoke the
 * single bearer token external agents (claude.ai, Claude Code, Claude Desktop)
 * use to read their personal-context snapshot via /api/mcp.
 *
 * v1 limit (per CONTEXT.md): ONE mcp_agent token per user. The composite PK
 * (user_id, provider) on integration_tokens means re-minting overwrites the
 * prior row. The McpTokensClient copy makes this explicit so the user knows
 * minting from a second device invalidates the first.
 *
 * Storage shortcut (per CONTEXT.md): the user-supplied label lives in
 * integration_tokens.refresh_token for v1. Documented as a follow-up
 * migration target.
 *
 * Server Component pattern mirrors /settings/desktop:
 *   - requireOnboarded() for auth
 *   - Drizzle read for the current token (if any)
 *   - Pass plain JSON-serializable props down to the Client island
 */

import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { MCP_PROVIDER } from "@/lib/mcp/mint-token";
import { McpTokensClient } from "./McpTokensClient";

export interface McpTokenRow {
  name: string;
  createdAt: string;
  lastUsedAt: string;
}

export default async function McpTokensPage() {
  const user = await requireOnboarded();

  const rows = await db
    .select({
      name: integrationTokens.refreshToken,
      createdAt: integrationTokens.createdAt,
      updatedAt: integrationTokens.updatedAt,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, user.id),
        eq(integrationTokens.provider, MCP_PROVIDER),
      ),
    )
    .limit(1);

  const existing: McpTokenRow[] = rows.map((r) => ({
    name: r.name?.trim() ? r.name.trim() : "MCP token",
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.updatedAt.toISOString(),
  }));

  // Build the connection URL the Client island shows in the copy-paste
  // snippet. Pulled at request time so localhost dev sees localhost and
  // production sees the deployed origin.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
 "https://<your-app>";
  const mcpUrl = `${appUrl}/api/mcp`;

  return (
    <main className="relative min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[720px] px-6 md:px-10 pt-10 pb-16">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Settings · MCP Tokens
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.01em] text-[var(--ink)]">
              MCP tokens
            </h1>
            <p className="mt-3 text-[16px] leading-[1.55] text-[var(--ink-muted)]">
              Bearer tokens for external agents (Claude Desktop, Claude Code,
              claude.ai web) to read your personal-context snapshot. The
              server stores only the SHA-256 hash — the plaintext is shown
              exactly once at mint time.
            </p>
          </div>
          <Link
            href="/settings"
            className="mt-1 inline-flex shrink-0 items-center rounded-lg border border-[var(--edge)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] transition-[color,border-color,background-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] hover:shadow-[var(--shadow-card)]"
          >
            ← settings
          </Link>
        </header>

        <McpTokensClient existing={existing} mcpUrl={mcpUrl} />
      </div>
    </main>
  );
}
