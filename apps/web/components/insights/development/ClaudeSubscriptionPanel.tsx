'use client';

import type { Result } from '@/lib/integrations/result';
import type {
  SubscriptionUsage,
  WeekUsage,
} from '@/lib/integrations/claude-code/subscription';
import { MAX_5X_LIMITS, pct } from '@/lib/integrations/claude-code/limits';
import { DevEmpty, DevPanel, DevPanelHeader, Eyebrow } from './dev-chrome';

interface Props {
  result: Result<SubscriptionUsage>;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatUsd(n: number | null): string {
  if (n == null) return 'n/a';
  return `$${n.toFixed(2)}`;
}

function formatWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (iso: string | null) => {
    if (!iso) return '?';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '?';
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  return `${fmt(start)} to ${fmt(end)}`;
}

const APPROX_CAPTION = 'approximate, vs configurable Max-5x limits';

// Subtle approximate-usage bar. percentage is clamped 0..100 or null (hidden).
// The fill is cyan — the console's single accent.
function ApproxBar({
  label,
  percentage,
  detail,
}: {
  label: string;
  percentage: number | null;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
        <span>{label}</span>
        <span className="text-[var(--sd-ink)] tabular-nums">
          {detail}
          {percentage != null ? (
            <span className="ml-2 text-[var(--sd-ink-faint)]">
              ~{percentage.toFixed(0)}%
            </span>
          ) : null}
        </span>
      </div>
      {percentage != null ? (
        // Recessed meter track — reads as a groove in the raised craft plate.
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--hover)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${percentage}%`,
              backgroundColor: 'var(--sd-accent)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ClaudeSubscriptionPanel({ result }: Props) {
  if (!result.ok) {
    return (
      <DevPanel>
        <DevPanelHeader eyebrow="Claude Code" />
        <p className="mt-3 font-mono text-xs text-[var(--sd-ink-faint)]">
          Couldn&apos;t load subscription usage. {result.error}
        </p>
      </DevPanel>
    );
  }

  const { session, weeks } = result.data;
  const latestWeek: WeekUsage | null =
    weeks.length > 0 ? weeks[weeks.length - 1] : null;

  if (!session && !latestWeek) {
    return (
      <DevPanel>
        <DevPanelHeader eyebrow="Claude Code" />
        <div className="mt-3">
          <DevEmpty heading="No subscription session synced yet" />
        </div>
      </DevPanel>
    );
  }

  const sessionWindow = session
    ? formatWindow(session.windowStart, session.windowEnd)
    : null;

  return (
    <DevPanel>
      <DevPanelHeader
        eyebrow="Claude Code"
        right={
          <span className="text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
            subscription
          </span>
        }
      />

      <div className="mt-4 flex flex-col gap-6">
        {/* Current 5-hour session block */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Eyebrow className="tracking-[0.08em]">Current session</Eyebrow>
            {sessionWindow ? (
              <span className="text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
                {sessionWindow}
              </span>
            ) : null}
          </div>

          {session ? (
            <>
              <div className="flex items-baseline gap-4 text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
                <span>
                  <span className="text-[var(--sd-ink)] tabular-nums">
                    {formatUsd(session.costUsd)}
                  </span>{' '}
                  cost
                </span>
                <span>
                  <span className="text-[var(--sd-ink)] tabular-nums">
                    {formatTokens(session.totalTokens)}
                  </span>{' '}
                  tok
                </span>
                {session.projectedCostUsd != null ? (
                  <span>
                    proj{' '}
                    <span className="text-[var(--sd-ink)] tabular-nums">
                      {formatUsd(session.projectedCostUsd)}
                    </span>
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <ApproxBar
                  label="cost of block"
                  detail={formatUsd(session.costUsd)}
                  percentage={pct(session.costUsd, MAX_5X_LIMITS.sessionCostUsd)}
                />
                <ApproxBar
                  label="tokens of block"
                  detail={formatTokens(session.totalTokens)}
                  percentage={pct(
                    session.totalTokens,
                    MAX_5X_LIMITS.sessionTokens,
                  )}
                />
              </div>
            </>
          ) : (
            <p className="text-meta text-[var(--sd-ink-faint)]">
              No active session block.
            </p>
          )}

          <p className="text-micro tracking-[0.08em] text-[var(--sd-ink-faint)]">
            {APPROX_CAPTION}
          </p>
        </div>

        {/* Weekly */}
        <div className="flex flex-col gap-3">
          <Eyebrow className="tracking-[0.08em]">This week</Eyebrow>

          {latestWeek ? (
            <>
              <div className="flex items-baseline gap-4 text-micro tracking-[0.06em] text-[var(--sd-ink-faint)]">
                <span>
                  <span className="text-[var(--sd-ink)] tabular-nums">
                    {formatUsd(latestWeek.costUsd)}
                  </span>{' '}
                  cost
                </span>
                <span>
                  <span className="text-[var(--sd-ink)] tabular-nums">
                    {formatTokens(latestWeek.totalTokens)}
                  </span>{' '}
                  tok
                </span>
                <span>
                  week of{' '}
                  <span className="text-[var(--sd-ink)] tabular-nums">
                    {latestWeek.weekStart}
                  </span>
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <ApproxBar
                  label="cost of week"
                  detail={formatUsd(latestWeek.costUsd)}
                  percentage={pct(
                    latestWeek.costUsd,
                    MAX_5X_LIMITS.weeklyCostUsd,
                  )}
                />
                <ApproxBar
                  label="tokens of week"
                  detail={formatTokens(latestWeek.totalTokens)}
                  percentage={pct(
                    latestWeek.totalTokens,
                    MAX_5X_LIMITS.weeklyTokens,
                  )}
                />
              </div>
            </>
          ) : (
            <p className="text-meta text-[var(--sd-ink-faint)]">
              No weekly usage synced yet.
            </p>
          )}

          <p className="text-micro tracking-[0.08em] text-[var(--sd-ink-faint)]">
            {APPROX_CAPTION}
          </p>
        </div>
      </div>
    </DevPanel>
  );
}
