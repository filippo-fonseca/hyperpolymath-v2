/**
 * /graph — interactive "spider web"view of the personal context graph.
 *
 * Phase 999.12 follow-up. Reads the latest persisted personal_context_snapshot
 * (the same payload exported to AI agents over MCP) and hands its nodes + edges
 * to a client force-directed explorer so the user can SEE and click through the
 * relationships across their knowledge base.
 *
 * Server Component pattern mirrors /settings/context: requireOnboarded() gate,
 * owner-scoped Drizzle read, plain JSON-serializable props to a client island.
 */

import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { personalContextSnapshots, integrationTokens } from "@/lib/db/schema";
import { GraphExplorer } from "./GraphExplorer";

interface SnapshotPayloadShape {
  generatedAt?: string;
  nodes?: unknown[];
  edges?: unknown[];
  meta?: {
    totalNodes?: number;
    totalEdges?: number;
    excludedNoExportCount?: number;
    nodeCounts?: Record<string, number>;
  };
}

export default async function GraphPage() {
  const user = await requireOnboarded();

  const [snapRows, tokenRows] = await Promise.all([
    db
      .select({
        snapshotDate: personalContextSnapshots.snapshotDate,
        schemaVersion: personalContextSnapshots.schemaVersion,
        payload: personalContextSnapshots.payload,
      })
      .from(personalContextSnapshots)
      .where(eq(personalContextSnapshots.userId, user.id))
      .orderBy(desc(personalContextSnapshots.snapshotDate))
      .limit(1),
    db
      .select({ updatedAt: integrationTokens.updatedAt })
      .from(integrationTokens)
      .where(
        and(
          eq(integrationTokens.userId, user.id),
          eq(integrationTokens.provider, "mcp_agent"),
        ),
      )
      .limit(1),
  ]);

  const row = snapRows[0];
  const payload = (row?.payload as SnapshotPayloadShape | undefined) ?? null;

  if (!row || !payload) {
    return (
      <main className="grid min-h-full place-items-center bg-[var(--sd-app)] px-6 text-center text-[var(--sd-ink)]">
        <div
          className={
            "max-w-md rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-8 " +
            "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset] " +
            "transition-colors duration-150 ease-out hover:border-[var(--sd-accent)]"
          }
        >
          <h1 className="text-3xl font-semibold tracking-[-0.01em]">Knowledge graph</h1>
          <p className="mt-3 text-[15px] leading-[1.55] text-[var(--sd-ink-dull)]">
            No snapshot has been built yet. The nightly job assembles your graph
            at 00:00 ET — or build one now from settings, then come back.
          </p>
          <Link
            href="/settings/context"
            className="sd-btn-primary mt-6 inline-flex rounded-full px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em]"
          >
            Go build a snapshot
          </Link>
        </div>
      </main>
    );
  }

  return (
    <GraphExplorer
      snapshotDate={String(row.snapshotDate)}
      schemaVersion={row.schemaVersion}
      generatedAt={typeof payload.generatedAt === "string" ? payload.generatedAt : null}
      nodes={(payload.nodes as Record<string, unknown>[]) ?? []}
      edges={(payload.edges as Record<string, unknown>[]) ?? []}
      meta={{
        totalNodes: payload.meta?.totalNodes ?? 0,
        totalEdges: payload.meta?.totalEdges ?? 0,
        excludedNoExportCount: payload.meta?.excludedNoExportCount ?? 0,
        nodeCounts: payload.meta?.nodeCounts ?? {},
      }}
      mcpTokenActive={tokenRows.length > 0}
    />
  );
}
