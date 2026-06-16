'use client';

import type { Result } from '@/lib/integrations/result';
import type {
  SubscriptionUsage,
  WeekUsage,
} from '@/lib/integrations/claude-code/subscription';
import { MAX_5X_LIMITS, pct } from '@/lib/integrations/claude-code/limits';
import { NEUMORPHIC_TILE, glassyTileShadow } from '../tile-style';

const ACCENT_VAR = 'var(--hud-cyan)';

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
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  return `${fmt(start)} to ${fmt(end)}`;
}

const APPROX_CAPTION = 'approximate, vs configurable Max-5x limits';

function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <section
      className={`group ${NEUMORPHIC_TILE} p-6`}
      style={
        {
          ['--panel-accent']: ACCENT_VAR,
          boxShadow: glassyTileShadow({ withPanelAccentHalo: true }),
        } as React.CSSProperties
      }
    >
      {children}
    </section>
  );
}

// Subtle approximate-usage bar. percentage is clamped 0..100 or null (hidden).
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
      <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
        <span>{label}</span>
        <span className="text-[var(--ink)]">
          {detail}
          {percentage != null ? (
            <span className="ml-2 text-[var(--ink-muted)]">~{percentage.toFixed(0)}%</span>
          ) : null}
        </span>
      </div>
      {percentage != null ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--edge)]/40">
          <div
            className="h-full rounded-full"
            style={{
              width: `${percentage}%`,
              backgroundColor: 'var(--hud-cyan)',
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
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Claude Code</h3>
        </header>
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Couldn&apos;t load subscription usage. {result.error}
        </p>
      </PanelChrome>
    );
  }

  const { session, weeks } = result.data;
  const latestWeek: WeekUsage | null = weeks.length > 0 ? weeks[weeks.length - 1] : null;

  if (!session && !latestWeek) {
    return (
      <PanelChrome>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-serif text-lg text-[var(--ink)]">Claude Code</h3>
        </header>
        <p className="font-serif text-sm text-[var(--ink-muted)]">
          No subscription session synced yet.
        </p>
      </PanelChrome>
    );
  }

  const sessionWindow = session
    ? formatWindow(session.windowStart, session.windowEnd)
    : null;

  return (
    <PanelChrome>
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-lg text-[var(--ink)]">Claude Code</h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          subscription
        </span>
      </header>

      <div className="flex flex-col gap-6">
        {/* Current 5-hour session block */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h4 className="font-serif text-sm text-[var(--ink)]">Current session</h4>
            {sessionWindow ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                {sessionWindow}
              </span>
            ) : null}
          </div>

          {session ? (
            <>
              <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                <span>
                  <span className="text-[var(--ink)]">{formatUsd(session.costUsd)}</span> cost
                </span>
                <span>
                  <span className="text-[var(--ink)]">{formatTokens(session.totalTokens)}</span> tok
                </span>
                {session.projectedCostUsd != null ? (
                  <span>
                    proj{' '}
                    <span className="text-[var(--ink)]">{formatUsd(session.projectedCostUsd)}</span>
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
                  percentage={pct(session.totalTokens, MAX_5X_LIMITS.sessionTokens)}
                />
              </div>
            </>
          ) : (
            <p className="font-serif text-xs text-[var(--ink-muted)]">
              No active session block.
            </p>
          )}

          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {APPROX_CAPTION}
          </p>
        </div>

        {/* Weekly */}
        <div className="flex flex-col gap-3">
          <h4 className="font-serif text-sm text-[var(--ink)]">This week</h4>

          {latestWeek ? (
            <>
              <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                <span>
                  <span className="text-[var(--ink)]">{formatUsd(latestWeek.costUsd)}</span> cost
                </span>
                <span>
                  <span className="text-[var(--ink)]">{formatTokens(latestWeek.totalTokens)}</span> tok
                </span>
                <span>
                  week of <span className="text-[var(--ink)]">{latestWeek.weekStart}</span>
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <ApproxBar
                  label="cost of week"
                  detail={formatUsd(latestWeek.costUsd)}
                  percentage={pct(latestWeek.costUsd, MAX_5X_LIMITS.weeklyCostUsd)}
                />
                <ApproxBar
                  label="tokens of week"
                  detail={formatTokens(latestWeek.totalTokens)}
                  percentage={pct(latestWeek.totalTokens, MAX_5X_LIMITS.weeklyTokens)}
                />
              </div>
            </>
          ) : (
            <p className="font-serif text-xs text-[var(--ink-muted)]">
              No weekly usage synced yet.
            </p>
          )}

          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {APPROX_CAPTION}
          </p>
        </div>
      </div>
    </PanelChrome>
  );
}
