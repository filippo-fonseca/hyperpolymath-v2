"use client";

import { useQuery } from "@tanstack/react-query";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { XpOverview } from "@/lib/db/queries/xp";
import { RANKS, rankForLevel, totalXpForLevel } from "@/lib/xp/levels";
import { XP_CATEGORY_META, type XpCategory } from "@/lib/xp/rules";
import { cn } from "@/lib/utils";
import { LevelRing } from "./LevelRing";
import { PanelHeader, StatTile, XpHeatmap, XpIcon, categoryColor, formatXp } from "./xp-ui";

/**
 * The profile XP page.
 *
 * Server renders the first paint and hands it over as initialData; realtime on
 * xp_events and user_xp refetches whenever an award lands, so finishing a task
 * in another tab moves the ring here without a reload.
 */
export function XpProfileClient({
  userId,
  initial,
  displayName,
}: {
  userId: string;
  initial: XpOverview;
  displayName: string;
}) {
  const { data = initial } = useQuery<XpOverview>({
    queryKey: tableKey("user_xp", userId),
    queryFn: async () => {
      const res = await fetch("/api/xp/overview", { cache: "no-store" });
      if (!res.ok) throw new Error("failed to load xp");
      return res.json();
    },
    initialData: initial,
  });

  // Both tables move on every award; the ledger is what the feed reads, so a
  // change to either has to invalidate this one key.
  useTableSubscription("user_xp", userId);
  useTableSubscription("xp_events", userId, { alsoInvalidate: [tableKey("user_xp", userId)] });

  const { progress, rank, nextRank } = data;
  const toNextRank = nextRank ? Math.max(0, totalXpForLevel(nextRank.minLevel) - data.totalXp) : 0;

  const categories = (Object.keys(XP_CATEGORY_META) as XpCategory[])
    .map((c) => ({ category: c, total: data.byCategory[c] ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const categoryTotal = categories.reduce((s, c) => s + c.total, 0) || 1;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="craft-card rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-9">
          <LevelRing level={data.level} progress={progress.progress} rank={rank} size={196} />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="font-serif text-micro uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              {displayName}
            </p>
            <h1
              className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl"
              style={{ color: `hsl(${rank.hue} 62% 42%)` }}
            >
              {rank.name}
            </h1>
            <p className="mt-1.5 max-w-md text-body text-[var(--ink-muted)]">{rank.blurb}</p>

            <div className="mt-5 space-y-2">
              <div className="flex items-baseline justify-between gap-4 font-mono text-micro tabular-nums text-[var(--ink-muted)]">
                <span>
                  <span className="text-[var(--ink)]">{formatXp(progress.xpIntoLevel)}</span>
                  {" / "}
                  {formatXp(progress.xpForLevel)} XP
                </span>
                <span>
                  {progress.isMaxLevel
                    ? "Maximum level"
                    : `${formatXp(progress.xpRemaining)} to level ${data.level + 1}`}
                </span>
              </div>

              <div
                className="h-2.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--edge)" }}
                role="progressbar"
                aria-valuenow={Math.round(progress.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress to level ${data.level + 1}`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(progress.progress * 100, progress.xpIntoLevel > 0 ? 2 : 0)}%`,
                    background: `linear-gradient(90deg, hsl(${rank.hue} 85% 62%), hsl(${(rank.hue + 42) % 360} 82% 55%))`,
                    transition: "width 700ms var(--ease-out-quart, cubic-bezier(0.165,0.84,0.44,1))",
                  }}
                />
              </div>

              {nextRank ? (
                <p className="text-micro text-[var(--ink-muted)]">
                  {formatXp(toNextRank)} XP until you ascend to{" "}
                  <span className="font-medium text-[var(--ink)]">{nextRank.name}</span> at level{" "}
                  {nextRank.minLevel}.
                </p>
              ) : (
                <p className="text-micro text-[var(--ink-muted)]">
                  Every rank in the ladder is behind you.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Numbers ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total XP" value={formatXp(data.totalXp)} sub="all time" />
        <StatTile label="Today" value={formatXp(data.earnedToday)} sub="so far" />
        <StatTile label="This week" value={formatXp(data.earnedThisWeek)} sub="last 7 days" />
        <StatTile
          label="Streak"
          value={`${data.currentStreak}d`}
          sub={`best ${data.longestStreak}d`}
          accent="#fb923c"
        />
        <StatTile
          label="Best day"
          value={data.bestDay ? formatXp(data.bestDay.total) : "—"}
          sub={data.bestDay?.date ?? "no data yet"}
        />
        <StatTile label="Active days" value={String(data.activeDays)} sub="past year" />
      </section>

      {/* ── Heatmap ──────────────────────────────────────────────────── */}
      <section className="craft-card rounded-2xl p-6">
        <PanelHeader
          title="A year of showing up"
          subtitle="Every day you earned anything, shaded by how much."
        />
        <XpHeatmap days={data.days} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* ── Where it came from ─────────────────────────────────────── */}
        <section className="craft-card rounded-2xl p-6">
          <PanelHeader title="Where it came from" subtitle="Share of XP by category, past year." />
          {categories.length === 0 ? (
            <EmptyLine>Nothing yet. Finish something and it will show up here.</EmptyLine>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full" aria-hidden="true">
                {categories.map((c) => (
                  <span
                    key={c.category}
                    style={{
                      width: `${(c.total / categoryTotal) * 100}%`,
                      background: categoryColor(c.category),
                    }}
                  />
                ))}
              </div>
              <ul className="mt-4 space-y-2.5">
                {categories.map((c) => (
                  <li key={c.category} className="flex items-center gap-2.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: categoryColor(c.category) }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-body text-[var(--ink)]">
                      {XP_CATEGORY_META[c.category].label}
                    </span>
                    <span className="font-mono text-micro tabular-nums text-[var(--ink-muted)]">
                      {Math.round((c.total / categoryTotal) * 100)}%
                    </span>
                    <span className="w-16 text-right font-mono text-micro tabular-nums text-[var(--ink)]">
                      {formatXp(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── Feed ───────────────────────────────────────────────────── */}
        <section className="craft-card rounded-2xl p-6">
          <PanelHeader title="Recent XP" subtitle="The last sixty awards." />
          {data.recent.length === 0 ? (
            <EmptyLine>Your ledger is empty. That is about to change.</EmptyLine>
          ) : (
            <ul className="-mx-2 max-h-[420px] space-y-0.5 overflow-y-auto pr-1">
              {data.recent.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-[var(--duration-micro,120ms)] hover:bg-[var(--edge)]/40"
                >
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-md"
                    // Inline colour: the tint is per-category, not a theme token.
                    style={{
                      background: `${categoryColor(e.category)}22`,
                      color: categoryColor(e.category),
                    }}
                  >
                    <XpIcon name={e.icon} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-[var(--ink)]">
                      {typeof e.metadata.title === "string" && e.metadata.title
                        ? e.metadata.title
                        : typeof e.metadata.name === "string" && e.metadata.name
                          ? e.metadata.name
                          : e.label}
                    </span>
                    <span className="block truncate text-micro text-[var(--ink-muted)]">
                      {e.label} · {relativeTime(e.occurredAt)}
                    </span>
                  </span>
                  <span
                    className="shrink-0 font-mono text-micro font-semibold tabular-nums"
                    style={{ color: categoryColor(e.category) }}
                  >
                    +{e.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Rank ladder ──────────────────────────────────────────────── */}
      <section className="craft-card rounded-2xl p-6">
        <PanelHeader
          title="The ladder"
          subtitle="Eleven ranks. You ascend one every five levels."
        />
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RANKS.map((r) => {
            const reached = data.level >= r.minLevel;
            const current = rankForLevel(data.level).minLevel === r.minLevel;
            return (
              <li
                key={r.name}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-[var(--duration-micro,120ms)]",
                  current ? "border-transparent" : "border-[var(--edge)]",
                  !reached && "opacity-45",
                )}
                style={
                  current
                    ? { background: `hsl(${r.hue} 85% 62% / 0.12)`, boxShadow: `inset 0 0 0 1.5px hsl(${r.hue} 70% 55% / 0.5)` }
                    : undefined
                }
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full font-mono text-micro font-semibold tabular-nums"
                  style={{
                    background: reached ? `hsl(${r.hue} 85% 62% / 0.2)` : "var(--edge)",
                    color: reached ? `hsl(${r.hue} 62% 40%)` : "var(--ink-muted)",
                  }}
                >
                  {r.minLevel}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-body font-semibold text-[var(--ink)]">
                    {r.name}
                  </span>
                  <span className="block truncate text-micro text-[var(--ink-muted)]">{r.blurb}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="craft-card rounded-2xl p-6">
        <PanelHeader
          title="How XP works"
          subtitle="Rates come straight from the database, so this table is never out of date."
        />
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {data.rules.map((r) => (
            <li
              key={r.kind}
              className="flex items-start gap-3 border-b border-[var(--edge)] py-2.5 last:border-0"
            >
              <span
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md"
                style={{
                  background: `${categoryColor(r.category)}22`,
                  color: categoryColor(r.category),
                }}
              >
                <XpIcon name={r.icon} className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-[var(--ink)]">{r.label}</span>
                {r.hint ? (
                  <span className="block text-micro text-[var(--ink-muted)]">{r.hint}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-micro font-semibold tabular-nums text-[var(--ink)]">
                  +{r.baseAmount}
                </span>
                {r.dailyCap != null ? (
                  <span className="block font-mono text-micro tabular-nums text-[var(--ink-muted)]">
                    max {r.dailyCap}/day
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-body text-[var(--ink-muted)]">{children}</p>;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
