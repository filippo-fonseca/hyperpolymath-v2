"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { DevRun, DevRunItem } from "@/lib/db/queries/dev-runs";
import type { Result } from "@/lib/integrations/result";
import type { DailyUsage } from "@/lib/integrations/claude-code/usage";
import type { AnthropicDailyUsage } from "@/lib/integrations/anthropic-api/usage";
import type { AnthropicDailyRequests } from "@/lib/integrations/anthropic-api/trends";
import type { SubscriptionUsage } from "@/lib/integrations/claude-code/subscription";
import { AnthropicApiPanel } from "./development/AnthropicApiPanel";
import { ClaudeSubscriptionPanel } from "./development/ClaudeSubscriptionPanel";
import { ClaudeCodePanel } from "./life/ClaudeCodePanel";

/**
 * 260615-lkl + 260616-g0y: owner-only DEVELOPMENT tab panel. Presentational
 * only (no data fetching). Consolidates all Claude/Anthropic spend: the
 * Anthropic API spend-per-day panel, the Claude Code subscription session +
 * weekly panel, the daily Claude Code tokens panel (moved here off LIFE), and
 * the auto-dev runs list. The owner gate lives upstream (page + InsightsTabs).
 */

interface DevelopmentTabPanelProps {
  runs: DevRun[];
  anthropicApi: Result<AnthropicDailyUsage[]>;
  // Optional per-day request counts (issue #133). The panel degrades when this
  // is absent or errored, so it's allowed to be undefined.
  anthropicApiRequests?: Result<AnthropicDailyRequests[]>;
  subscription: Result<SubscriptionUsage>;
  claudeCode: Result<DailyUsage[]>;
}

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

// Prefer the explicit PR link, then any stored URL (older rows put the PR in
// branchUrl), then the bare branch tree.
function itemHref(item: DevRunItem): string | null {
  if (item.prUrl) return item.prUrl;
  if (item.branchUrl) return item.branchUrl;
  if (item.branch) return `${REPO_TREE_BASE}/${item.branch}`;
  return null;
}

// A GitHub PR URL contains "/pull/"; anything else is a branch tree link.
function isPrHref(href: string | null): boolean {
  return !!href && href.includes("/pull/");
}

export function DevelopmentTabPanel({
  runs,
  anthropicApi,
  anthropicApiRequests,
  subscription,
  claudeCode,
}: DevelopmentTabPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Spend panels: two-up on wide viewports, matching LifeTabPanel's grid. */}
      <div className="flex flex-col gap-6 @2xl/main:grid @2xl/main:grid-cols-2">
        <AnthropicApiPanel
          result={anthropicApi}
          requests={anthropicApiRequests}
        />
        <ClaudeSubscriptionPanel result={subscription} />
        <div className="@2xl/main:col-span-2">
          <ClaudeCodePanel result={claudeCode} />
        </div>
      </div>

      {/* Auto-dev runs list (unchanged). EmptyState is now a section, not an
          early return for the whole panel, so the spend panels always render. */}
      {runs.length === 0 ? (
        <EmptyState
          heading="No auto-dev runs yet."
          body="The local Kiwi auto-dev worker has not reported a run. Its daily summary will land here once it does."
        />
      ) : (
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
                const isPr = isPrHref(href);
                return (
                  <li
                    key={`${run.id}-${item.issueNumber}`}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "rounded-sm px-1.5 py-0.5 ring-1 ring-inset",
                          LABEL_CLASS,
                          statusBadgeClass(item.status),
                        )}
                      >
                        {item.status}
                      </span>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-serif text-sm text-[var(--ink)] hover:text-[var(--hud-cyan)] transition-colors"
                        >
                          #{item.issueNumber} {item.title}
                        </a>
                      ) : (
                        <span className="font-serif text-sm text-[var(--ink)]">
                          #{item.issueNumber} {item.title}
                        </span>
                      )}
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            LABEL_CLASS,
                            "shrink-0 text-[var(--ink-muted)] hover:text-[var(--hud-cyan)] transition-colors",
                          )}
                        >
                          {isPr ? "view pr ↗" : (item.branch ?? "branch ↗")}
                        </a>
                      ) : null}
                    </div>
                    {item.summary ? (
                      <p className="whitespace-pre-line pl-1 font-serif text-xs leading-relaxed text-[var(--ink-muted)]">
                        {item.summary}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
          ))}
        </div>
      )}
    </div>
  );
}
