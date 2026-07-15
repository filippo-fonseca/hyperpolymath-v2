"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { DevRun, DevRunItem } from "@/lib/db/queries/dev-runs";
import type { Result } from "@/lib/integrations/result";
import type { DailyUsage } from "@/lib/integrations/claude-code/usage";
import type { AnthropicDailyUsage } from "@/lib/integrations/anthropic-api/usage";
import type { AnthropicDailyRequests } from "@/lib/integrations/anthropic-api/trends";
import type { SubscriptionUsage } from "@/lib/integrations/claude-code/subscription";
import { AnthropicApiPanel } from "./development/AnthropicApiPanel";
import { ClaudeSubscriptionPanel } from "./development/ClaudeSubscriptionPanel";
import { ManualTriggerPanel } from "./development/ManualTriggerPanel";
import { ClaudeCodePanel } from "./life/ClaudeCodePanel";
import {
  DevEmpty,
  DevPanel,
  DevPanelHeader,
  Eyebrow,
  StatePill,
  StatReadout,
  type PillTone,
} from "./development/dev-chrome";

/**
 * 260615-lkl + 260616-g0y (sesh-sd3 rebuild): owner-only DEVELOPMENT tab — the
 * Kiwi auto-dev pipeline console. Presentational only (no data fetching); the
 * owner gate lives upstream (page + InsightsTabs).
 *
 * Full sd-register rebuild: a console header stat strip (font-black tabular-nums
 * readouts over mono eyebrows), the consolidated Claude/Anthropic spend plates,
 * manual pipeline triggers, and the auto-dev pipeline as a MONO LEDGER TABLE.
 *
 * Ledger over stage columns: DevRun[] → DevRunItem[] is a time-ordered per-issue
 * outcome log (status / #issue / title / PR link), not live WIP flowing between
 * stages — so a CI-log-style ledger shows the real captures→issue→PR provenance
 * without the emptiness of mostly-idle kanban columns.
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

// Functional tone per item status: done = cyan, failed/timed-out = coral,
// skipped = idle grey (calm hairline).
function statusTone(status: DevRunItem["status"]): PillTone {
  switch (status) {
    case "done":
      return "accent";
    case "failed":
    case "timed-out":
      return "coral";
    default:
      return "idle";
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
  const reduced = useReducedMotion();

  // Console headline aggregates across the loaded run window.
  const totalDone = runs.reduce((a, r) => a + r.issuesDone, 0);
  const totalSkipped = runs.reduce((a, r) => a + r.issuesSkipped, 0);
  const totalFailed = runs.reduce((a, r) => a + r.issuesFailed, 0);
  const totalPrs = runs.reduce(
    (a, r) => a + r.items.filter((i) => isPrHref(itemHref(i))).length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Console header — auto-dev pipeline at a glance. */}
      <DevPanel>
        <DevPanelHeader
          eyebrow="Auto-dev pipeline"
          right={
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
              last {runs.length} {runs.length === 1 ? "run" : "runs"}
            </span>
          }
        />
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <StatReadout label="Issues done" value={totalDone} tone="accent" />
          <StatReadout label="PRs opened" value={totalPrs} />
          <StatReadout label="Skipped" value={totalSkipped} />
          <StatReadout
            label="Failed"
            value={totalFailed}
            tone={totalFailed > 0 ? "coral" : undefined}
          />
        </div>
      </DevPanel>

      {/* Consolidated Claude / Anthropic spend. Two-up on wide viewports; the
          daily Claude Code tokens chart spans full width beneath. */}
      <div className="flex flex-col gap-6 @2xl/main:grid @2xl/main:grid-cols-2">
        <AnthropicApiPanel result={anthropicApi} requests={anthropicApiRequests} />
        <ClaudeSubscriptionPanel result={subscription} />
        <div className="@2xl/main:col-span-2">
          <ClaudeCodePanel result={claudeCode} />
        </div>
      </div>

      {/* Manual triggers for captures-to-issues and kiwi-autodev. */}
      <ManualTriggerPanel />

      {/* Pipeline ledger — one plate per daily run, mono item rows. */}
      <DevPanel>
        <DevPanelHeader
          eyebrow="Pipeline ledger"
          right={
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
              captures → issues → prs
            </span>
          }
        />
        {runs.length === 0 ? (
          <div className="mt-4">
            <DevEmpty
              heading="No auto-dev runs yet"
              body="The local Kiwi auto-dev worker has not reported a run. Its daily summary lands here once it does."
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {runs.map((run, i) => (
              <motion.div
                key={run.id}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        duration: 0.16,
                        ease: [0.25, 1, 0.5, 1],
                        delay: Math.min(i, 12) * 0.01,
                      }
                }
              >
                <RunGroup run={run} />
              </motion.div>
            ))}
          </div>
        )}
      </DevPanel>
    </div>
  );
}

/** One daily run: header (date + count readouts) then a mono ledger of items. */
function RunGroup({ run }: { run: DevRun }) {
  return (
    <div className="rounded-[10px] border border-[var(--sd-line)] bg-[var(--sd-app)]">
      {/* Run header row. */}
      <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
        <span className="font-mono text-[13px] font-medium tabular-nums text-[var(--sd-ink)]">
          {run.runDate}
        </span>
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
          <span>
            <span className="text-[var(--sd-accent)] tabular-nums">
              {run.issuesDone}
            </span>{" "}
            done
          </span>
          <span>
            <span className="tabular-nums">{run.issuesSkipped}</span> skipped
          </span>
          <span
            className={cn(run.issuesFailed > 0 && "text-[var(--ink-coral)]")}
          >
            <span className="tabular-nums">{run.issuesFailed}</span> failed
          </span>
        </div>
      </div>

      {run.items.length > 0 ? (
        <ul className="flex flex-col border-t border-[var(--sd-line)]">
          {run.items.map((item) => (
            <LedgerRow
              key={`${run.id}-${item.issueNumber}`}
              item={item}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One issue outcome: state pill, #issue + title, trailing branch/PR link. */
function LedgerRow({ item }: { item: DevRunItem }) {
  const href = itemHref(item);
  const isPr = isPrHref(href);

  return (
    <li className="flex flex-col gap-1.5 border-t border-[var(--sd-line)] px-3.5 py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <StatePill tone={statusTone(item.status)}>{item.status}</StatePill>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-[13px] text-[var(--sd-ink)] transition-colors duration-150 hover:text-[var(--sd-accent)]"
          >
            <span className="font-mono tabular-nums text-[var(--sd-ink-dull)]">
              #{item.issueNumber}
            </span>{" "}
            {item.title}
          </a>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--sd-ink)]">
            <span className="font-mono tabular-nums text-[var(--sd-ink-dull)]">
              #{item.issueNumber}
            </span>{" "}
            {item.title}
          </span>
        )}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)] transition-colors duration-150 hover:text-[var(--sd-accent)]"
          >
            {isPr ? "view pr ↗" : (item.branch ?? "branch ↗")}
          </a>
        ) : null}
      </div>
      {item.summary ? (
        <p className="whitespace-pre-line pl-2 text-[12px] leading-relaxed text-[var(--sd-ink-dull)]">
          {item.summary}
        </p>
      ) : null}
    </li>
  );
}
