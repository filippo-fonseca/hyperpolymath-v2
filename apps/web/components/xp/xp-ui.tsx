"use client";

import { cn } from "@/lib/utils";
import { XP_CATEGORY_META, type XpCategory } from "@/lib/xp/rules";
import {
  Apple,
  ArrowRightLeft,
  BookOpenCheck,
  CalendarCheck,
  CalendarPlus,
  CircleCheck,
  Compass,
  Dumbbell,
  FileText,
  Flame,
  FolderPlus,
  Inbox,
  type LucideIcon,
  PenLine,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

/**
 * Shared bits for the XP surfaces.
 *
 * The icon map is explicit rather than a dynamic `lucide-react` lookup so the
 * bundler can tree-shake: importing the whole icon set to resolve fifteen
 * names by string would pull in a few hundred kilobytes for nothing.
 */
const ICONS: Record<string, LucideIcon> = {
  Apple,
  ArrowRightLeft,
  BookOpenCheck,
  CalendarCheck,
  CalendarPlus,
  CircleCheck,
  Compass,
  Dumbbell,
  FileText,
  Flame,
  FolderPlus,
  Inbox,
  PenLine,
  Sparkles,
  Trophy,
  Zap,
};

export function XpIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}

export function categoryColor(category: XpCategory): string {
  return XP_CATEGORY_META[category]?.color ?? "#94a3b8";
}

/** Compact number for tiles: 12400 reads better as 12.4k at this size. */
export function formatXp(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString();
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export function StatTile({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  className?: string;
}) {
  return (
    // `.craft-card` paints the plate; never add a bg-* utility alongside it.
    <div className={cn("craft-card rounded-xl px-4 py-3.5", className)}>
      <div className="flex items-center gap-1.5">
        {accent ? (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: accent }}
            aria-hidden="true"
          />
        ) : null}
        <span className="font-serif text-micro uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums leading-none text-[var(--ink)]">
        {value}
      </p>
      {sub ? <p className="mt-1 text-micro text-[var(--ink-muted)]">{sub}</p> : null}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <div>
        <h2 className="font-serif text-subtitle font-semibold tracking-tight text-[var(--ink)]">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-micro text-[var(--ink-muted)]">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}

/**
 * A year of daily XP, GitHub-style.
 *
 * Intensity is bucketed against the window's own busiest day rather than a
 * fixed scale, so the grid stays legible whether a good day is 80 XP or 800.
 */
export function XpHeatmap({
  days,
  weeks = 53,
  className,
}: {
  days: { date: string; total: number }[];
  weeks?: number;
  className?: string;
}) {
  const byDate = new Map(days.map((d) => [d.date, d.total]));
  const max = days.reduce((m, d) => Math.max(m, d.total), 0);

  // Walk back to the Sunday that starts the window so columns are real weeks.
  const today = new Date();
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (weeks * 7 - 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const columns: { date: string; total: number }[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: { date: string; total: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      week.push({ date: iso, total: cursor <= end ? (byDate.get(iso) ?? 0) : -1 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    columns.push(week);
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="flex gap-[3px]">
        {columns.map((week) => (
          <div key={week[0].date} className="flex flex-col gap-[3px]">
            {week.map((cell) => {
              if (cell.total < 0) {
                return <span key={cell.date} className="size-[11px]" aria-hidden="true" />;
              }
              const ratio = max > 0 ? cell.total / max : 0;
              // Four visible steps plus empty. A tiny floor on opacity keeps a
              // 1 XP day from being indistinguishable from a blank one.
              const level = cell.total === 0 ? 0 : ratio > 0.66 ? 4 : ratio > 0.33 ? 3 : ratio > 0.12 ? 2 : 1;
              return (
                <span
                  key={cell.date}
                  title={`${cell.date} — ${cell.total} XP`}
                  className="size-[11px] rounded-[3px]"
                  style={{
                    background:
                      level === 0
                        ? "var(--edge)"
                        : `hsl(210 85% ${72 - level * 9}% / ${0.35 + level * 0.16})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
