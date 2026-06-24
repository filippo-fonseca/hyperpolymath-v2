"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getProcessingRunsForPage,
  type ProcessingRun,
} from "@/app/actions/page-processing";
import { formatReceiptSummary, type ReceiptAction } from "@/lib/jarvis/receipt-summary";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, History, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Per-page "Processing runs" history (issue #92 part 6). A small History button
 * (Daily Pages only) that, when opened, lazily loads every "Process this page"
 * run for the page and lists each one: when it ran, what it did (receipt
 * summary), and its status. Re-fetches on each open so a just-finished run shows
 * up without any cross-component wiring. `refreshKey` bumps from the parent
 * after a process completes to force a re-fetch even if the panel stays mounted.
 */
export function PageProcessingRunsMenu({
  pageId,
  refreshKey,
}: {
  pageId: string;
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<ProcessingRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<number | undefined>(undefined);

  async function load() {
    setLoading(true);
    try {
      const data = await getProcessingRunsForPage(pageId);
      setRuns(data);
      setLoadedKey(refreshKey);
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // (Re)load on open, and whenever a new run landed since the last load.
    if (next && (runs === null || loadedKey !== refreshKey)) void load();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="View past processing runs for this page"
          className="glass-button inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-serif text-[var(--ink-muted)] hover:text-[var(--hud-cyan)] transition-colors duration-150 cursor-pointer"
        >
          <History size={12} strokeWidth={1.75} />
          <span>History</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--edge)]">
          <p className="text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--ink-muted)]">
            Processing runs
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading && (runs === null || runs.length === 0) ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-[var(--ink-muted)]">
              <Loader2 size={13} strokeWidth={1.75} className="animate-spin" />
              Loading…
            </div>
          ) : runs && runs.length > 0 ? (
            <ul className="divide-y divide-[var(--edge)]">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
          ) : (
            <div className="px-3 py-4 text-[12px] text-[var(--ink-muted)]">
              Not processed yet. Hit “Process this page” to extract tasks, events,
              and captures.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RunRow({ run }: { run: ProcessingRun }) {
  const router = useRouter();
  const when = formatDistanceToNow(new Date(run.createdAt), { addSuffix: true });
  const summary =
    run.status === "skipped"
      ? "No changes — nothing to extract"
      : run.actions.length > 0
        ? formatReceiptSummary(run.actions as ReceiptAction[])
        : run.responseText?.trim() || "Nothing to add";

  // Runs that landed an assistant turn deep-link to that turn in the JARVIS
  // conversation, where the receipts live. Skipped runs have no turn.
  const linkable = Boolean(run.turnId);

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-serif text-[var(--ink)] truncate">
          {summary}
        </span>
        <StatusBadge status={run.status} />
      </div>
      <span className="text-[11px] font-mono text-[var(--ink-muted)] flex items-center gap-1">
        {when}
        {linkable ? (
          <ArrowUpRight
            size={11}
            strokeWidth={1.75}
            className="opacity-0 group-hover/run:opacity-70 transition-opacity"
          />
        ) : null}
      </span>
    </>
  );

  if (!linkable) {
    return <li className="px-3 py-2 flex flex-col gap-0.5">{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => router.push(`/today?messageId=${run.turnId}`)}
        title="View this run in the JARVIS conversation"
        className="group/run w-full text-left px-3 py-2 flex flex-col gap-0.5 hover:bg-[var(--hud-cyan)]/5 transition-colors cursor-pointer"
      >
        {body}
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: ProcessingRun["status"] }) {
  const label =
    status === "done" ? "done" : status === "skipped" ? "skipped" : "error";
  const color =
    status === "error" ? "text-destructive" : "text-[var(--ink-muted)]";
  return (
    <span
      className={`flex-shrink-0 text-[10px] font-mono uppercase tracking-[0.06em] ${color}`}
    >
      {label}
    </span>
  );
}
