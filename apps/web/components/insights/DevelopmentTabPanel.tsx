"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { DevRun, DevRunItem } from "@/lib/db/queries/dev-runs";

/**
 * 260615-lkl: owner-only DEVELOPMENT tab panel. Presentational only (no data
 * fetching). Lists daily auto-dev runs newest-first with per-issue rows and
 * branch links. The owner gate lives upstream (page + InsightsTabs); this
 * component just renders whatever runs it is handed.
 */

const REPO_TREE_BASE = "https://github.com/filippo-fonseca/hyperpolymath-v2/tree";

// Small-caps mono label matching the insights TabButton style.
const LABEL_CLASS = "font-mono text-[11px] uppercase tracking-[0.06em]";

// Restrained, token-driven status treatment (JARVIS x Notion: no loud colors).
function statusBadgeClass(status: DevRunItem["status"]): string {
  switch (status) {
    case "done":
      return "text-[var(--hud-cyan)] ring-[var(--hud-cyan)]/30";
    case "skipped":
      return "text-[var(--ink-muted)] ring-[var(--edge)]";
    case "failed":
    case "timed-out":
      return "text-[var(--ink)] ring-[var(--edge)]";
    default:
      return "text-[var(--ink-muted)] ring-[var(--edge)]";
  }
}

function itemHref(item: DevRunItem): string | null {
  if (item.branchUrl) return item.branchUrl;
  if (item.branch) return `${REPO_TREE_BASE}/${item.branch}`;
  return null;
}

export function DevelopmentTabPanel({ runs }: { runs: DevRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        heading="No auto-dev runs yet."
        body="The local Kiwi auto-dev worker has not reported a run. Its daily summary will land here once it does."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {runs.map((run) => (
        <div
          key={run.id}
          className="rounded-md border border-[var(--edge)] bg-[var(--surface)] p-4"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-serif text-lg font-semibold text-[var(--ink)]">
              {run.runDate}
            </h3>
            <div className="flex items-center gap-3 text-[var(--ink-muted)]">
              <span className={LABEL_CLASS}>{run.issuesDone} done</span>
              <span className={LABEL_CLASS}>{run.issuesSkipped} skipped</span>
              <span className={LABEL_CLASS}>{run.issuesFailed} failed</span>
            </div>
          </div>

          {run.items.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {run.items.map((item) => {
                const href = itemHref(item);
                return (
                  <li
                    key={`${run.id}-${item.issueNumber}`}
                    className="flex items-center gap-3"
                  >
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 ring-1 ring-inset",
                        LABEL_CLASS,
                        statusBadgeClass(item.status),
                      )}
                    >
                      {item.status}
                    </span>
                    <span className="font-serif text-sm text-[var(--ink)]">
                      #{item.issueNumber} {item.title}
                    </span>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          LABEL_CLASS,
                          "text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors",
                        )}
                      >
                        {item.branch ?? "branch"}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
