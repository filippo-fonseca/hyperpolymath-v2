"use client";

/**
 * ContextSnapshotClient — Client island for /settings/context.
 *
 * Renders the latest snapshot meta, a "Rebuild now" button that POSTs to
 * /api/context/rebuild (shipped in Plan 04), a collapsible JSON preview of
 * the full payload, and a metadata-only history of the last 30 days.
 *
 * Pattern mirrors DesktopDevicesClient: useTransition for in-flight UI,
 * sonner toasts for success/error, router.refresh() to re-fetch the Server
 * Component data after a successful rebuild.
 *
 * v1 limit (per CONTEXT.md): NoExportToggle mounts on /settings/memory only.
 * Per-capture and per-task toggle mounts are deferred — the column exists on
 * captures + tasks from migration 0027 so future plans can add UI atop.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import type {
  LatestSnapshot,
  HistoryEntry,
} from "./page";

interface Props {
  latest: LatestSnapshot | null;
  history: HistoryEntry[];
}

function nodeCountSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return "no nodes";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${type}: ${n}`)
    .join(" · ");
}

export function ContextSnapshotClient({ latest, history }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [payloadOpen, setPayloadOpen] = useState(false);

  function onRebuild() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/context/rebuild", {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(body?.error ?? `Rebuild failed (HTTP ${res.status})`);
          return;
        }
        const body = (await res.json()) as {
          ok: boolean;
          snapshotDate?: string;
          meta?: { totalNodes?: number; excludedNoExportCount?: number };
        };
        const nodes = body.meta?.totalNodes ?? 0;
        const excluded = body.meta?.excludedNoExportCount ?? 0;
        toast.success(
          excluded > 0
            ? `Snapshot rebuilt — ${nodes} nodes, ${excluded} hidden.`
            : `Snapshot rebuilt — ${nodes} nodes.`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rebuild failed.");
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* Latest snapshot summary card */}
      <section className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg text-[var(--sd-ink)]">
              Latest snapshot
            </h2>
            {latest ? (
              <p className="mt-1 text-micro tracking-[0.06em] text-[var(--sd-ink-dull)]">
                {latest.snapshotDate}
                <span aria-hidden="true" className="mx-2">
                  ·
                </span>
                schema v{latest.schemaVersion}
                {latest.generatedAt ? (
                  <>
                    <span aria-hidden="true" className="mx-2">
                      ·
                    </span>
                    built {latest.generatedAt}
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-meta text-[var(--sd-ink-dull)]">
                No snapshot yet. The nightly cron runs at 00:00 ET, or you can
                build one now.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRebuild}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[var(--sd-ink)] px-4 py-2 text-micro tracking-[0.06em] text-[var(--sd-app)] hover:opacity-90 disabled:opacity-40 transition-opacity duration-100 ease-out"
          >
            <RefreshCw
              size={14}
              className={pending ? "animate-spin" : undefined}
            />
            {pending ? "Building…" : "Rebuild now"}
          </button>
        </div>

        {latest ? (
          <>
            <dl className="mt-5 grid grid-cols-3 gap-4">
              <div>
                <dt className="text-micro tracking-[0.06em] text-[var(--sd-ink-dull)]">
                  Total nodes
                </dt>
                <dd className="mt-1 text-2xl text-[var(--sd-ink)]">
                  {latest.totalNodes}
                </dd>
              </div>
              <div>
                <dt className="text-micro tracking-[0.06em] text-[var(--sd-ink-dull)]">
                  Total edges
                </dt>
                <dd className="mt-1 text-2xl text-[var(--sd-ink)]">
                  {latest.totalEdges}
                </dd>
              </div>
              <div>
                <dt className="text-micro tracking-[0.06em] text-[var(--sd-ink-dull)]">
                  Hidden (no-export)
                </dt>
                <dd className="mt-1 text-2xl text-[var(--sd-ink)]">
                  {latest.excludedNoExportCount}
                </dd>
              </div>
            </dl>

            {Object.keys(latest.nodeCounts).length > 0 ? (
              <p className="mt-4 font-mono text-micro text-[var(--sd-ink-dull)]">
                {nodeCountSummary(latest.nodeCounts)}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => setPayloadOpen((v) => !v)}
              className="mt-5 inline-flex items-center gap-1 text-micro tracking-[0.06em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors duration-100 ease-out"
              aria-expanded={payloadOpen}
            >
              {payloadOpen ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {payloadOpen ? "Hide payload JSON" : "View payload JSON"}
            </button>

            {payloadOpen ? (
              <pre className="mt-3 max-h-[600px] overflow-auto rounded-md border border-[var(--sd-line)] bg-[var(--sd-hover)] px-3 py-2 font-mono text-micro leading-[1.5] text-[var(--sd-ink)] whitespace-pre">
                {latest.prettyPayload}
              </pre>
            ) : null}
          </>
        ) : null}
      </section>

      {/* History */}
      <section>
        <h2 className="text-lg text-[var(--sd-ink)]">
          Recent snapshots
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-meta text-[var(--sd-ink-dull)]">
            None yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--sd-line)] border-y border-[var(--sd-line)]">
            {history.map((h) => (
              <li
                key={h.snapshotDate}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-micro text-[var(--sd-ink)]">
                    {h.snapshotDate}
                  </p>
                  <p className="font-mono text-micro text-[var(--sd-ink-dull)] truncate">
                    {h.totalNodes} nodes · {h.totalEdges} edges
                    {h.excludedNoExportCount > 0
                      ? ` · ${h.excludedNoExportCount} hidden`
                      : ""}
                    {Object.keys(h.nodeCounts).length > 0
                      ? ` · ${nodeCountSummary(h.nodeCounts)}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
