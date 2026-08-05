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
import { Waypoints } from "lucide-react";
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
      <main className="grid min-h-full place-items-center bg-[var(--canvas)] px-6 text-center text-[var(--ink)]">
        {/* Craft register: a raised white plate, and the page's lavender hue
            carried on the icon so the empty state still says "graph". */}
        <div className="max-w-md rounded-2xl border border-[var(--edge)] bg-[var(--surface-raised)] p-8 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]">
          <span className="tint-lavender mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--tint-bg)] text-[var(--tint-ink)]">
            <Waypoints className="size-6" />
          </span>
 <h1 className="mt-4 text-display font-semibold tracking-[-0.01em]">Knowledge graph</h1>
          <p className="mt-3 text-body leading-[1.55] text-[var(--ink-muted)]">
            No snapshot has been built yet. The nightly job assembles your graph
            at 00:00 ET. You can also build one now from settings, then come back.
          </p>
          <Link
            href="/settings/context"
            className="craft-chip mt-6 cursor-pointer-always"
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
