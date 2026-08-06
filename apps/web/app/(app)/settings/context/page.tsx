/**
 * /settings/context — Personal Context preview + manual rebuild.
 *
 * Phase 999.12 Plan 05 / CTX-08. Surfaces the latest persisted snapshot from
 * personal_context_snapshots so the user can SEE what external MCP agents
 * receive about them, plus a "Rebuild now" button that hits
 * /api/context/rebuild (CTX-08 backing endpoint shipped in Plan 04).
 *
 * Server Component pattern mirrors /settings/desktop:
 *   1. requireOnboarded() for auth — layout already gates (app), this also
 *      enforces onboarded-state + redirects to /sign-in if cookies are stale
 *   2. Drizzle read against personal_context_snapshots, owner-scoped
 *   3. Pass plain JSON-serializable props down to a Client island
 *
 * Aesthetic mirrors /settings/desktop verbatim (canvas bg, EB Garamond serif
 * header, mono chrome label, 720px content column).
 */

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { personalContextSnapshots } from "@/lib/db/schema";
import { ContextSnapshotClient } from "./ContextSnapshotClient";

interface SnapshotPayloadMeta {
  totalNodes?: number;
  totalEdges?: number;
  excludedNoExportCount?: number;
  nodeCounts?: Record<string, number>;
}

interface SnapshotPayloadShape {
  schemaVersion?: number;
  generatedAt?: string;
  nodes?: unknown[];
  edges?: unknown[];
  meta?: SnapshotPayloadMeta;
}

export interface HistoryEntry {
  snapshotDate: string;
  totalNodes: number;
  totalEdges: number;
  excludedNoExportCount: number;
  nodeCounts: Record<string, number>;
}

export interface LatestSnapshot {
  snapshotDate: string;
  schemaVersion: number;
  generatedAt: string | null;
  totalNodes: number;
  totalEdges: number;
  excludedNoExportCount: number;
  nodeCounts: Record<string, number>;
  // Pretty-printed JSON so the Client island doesn't have to redo the work
  // for the collapsible preview. Already JSON-serialized = safe to RSC-pass.
  prettyPayload: string;
}

export default async function ContextSettingsPage() {
  const user = await requireOnboarded();

  const rows = await db
    .select({
      snapshotDate: personalContextSnapshots.snapshotDate,
      schemaVersion: personalContextSnapshots.schemaVersion,
      payload: personalContextSnapshots.payload,
    })
    .from(personalContextSnapshots)
    .where(eq(personalContextSnapshots.userId, user.id))
    .orderBy(desc(personalContextSnapshots.snapshotDate))
    .limit(30);

  const latest: LatestSnapshot | null = rows[0]
    ? (() => {
        const p = (rows[0].payload as SnapshotPayloadShape) ?? {};
        return {
          snapshotDate: String(rows[0].snapshotDate),
          schemaVersion: rows[0].schemaVersion,
          generatedAt: typeof p.generatedAt === "string" ? p.generatedAt : null,
          totalNodes: p.meta?.totalNodes ?? 0,
          totalEdges: p.meta?.totalEdges ?? 0,
          excludedNoExportCount: p.meta?.excludedNoExportCount ?? 0,
          nodeCounts: p.meta?.nodeCounts ?? {},
          prettyPayload: JSON.stringify(p, null, 2),
        };
      })()
    : null;

  const history: HistoryEntry[] = rows.map((r) => {
    const p = (r.payload as SnapshotPayloadShape) ?? {};
    return {
      snapshotDate: String(r.snapshotDate),
      totalNodes: p.meta?.totalNodes ?? 0,
      totalEdges: p.meta?.totalEdges ?? 0,
      excludedNoExportCount: p.meta?.excludedNoExportCount ?? 0,
      nodeCounts: p.meta?.nodeCounts ?? {},
    };
  });

  return (
    <main className="relative min-h-full bg-[var(--sd-app)] text-[var(--sd-ink)]">
      <div className="mx-auto w-full max-w-[720px] px-6 md:px-10 pt-10 pb-16">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-micro text-[var(--sd-ink-dull)]">
              JARVIS · Personal Context
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--sd-ink)]">
              Personal context
            </h1>
            <p className="mt-3 text-subtitle leading-[1.55] text-[var(--sd-ink-dull)]">
              What external agents see about you, refreshed nightly. Rebuild
              on demand to fold in changes you made since the last snapshot.
              Rows you flag <span className="font-mono text-meta">no-export</span>{" "}
              are excluded. The count below reflects the most recent build.
            </p>
          </div>
          <Link
            href="/jarvis"
            className="shrink-0 mt-1 text-micro tracking-[0.06em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors duration-100 ease-out"
          >
            ← jarvis
          </Link>
        </header>

        <ContextSnapshotClient latest={latest} history={history} />
      </div>
    </main>
  );
}
