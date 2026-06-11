/**
 * /graph — interactive "spider web" view of the personal context graph.
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

export const dynamic = "force-dynamic";

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
        <div
          className={
            "max-w-md rounded-xl border border-[color-mix(in_oklch,var(--edge)_70%,transparent)] bg-[var(--surface)] p-8 " +
            "shadow-[6px_6px_18px_color-mix(in_oklch,var(--ink)_8%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
            "hover:border-[var(--edge-hud)] hover:shadow-[8px_8px_22px_color-mix(in_oklch,var(--ink)_12%,transparent),-5px_-5px_16px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
            "transition-[border-color,box-shadow] duration-200 ease-out"
          }
        >
          <h1 className="font-serif text-3xl font-semibold">Knowledge graph</h1>
          <p className="mt-3 font-serif text-[16px] leading-[1.55] text-[var(--ink-muted)]">
            No snapshot has been built yet. The nightly job assembles your graph
            at 00:00 ET — or build one now from settings, then come back.
          </p>
          <Link
            href="/settings/context"
            className="mt-6 inline-flex rounded-md bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] hover:opacity-90"
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
