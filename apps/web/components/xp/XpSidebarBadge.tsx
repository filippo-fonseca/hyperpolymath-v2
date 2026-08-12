"use client";

import Link from "next/link";
import { useXpBadge } from "@/lib/xp/useXpBadge";
import { cn } from "@/lib/utils";

/**
 * The level chip in the sidebar identity block.
 *
 * Doubles as the entry point to /profile, which is otherwise unreachable from
 * the shell. Small on purpose: it is a glance, not a dashboard, and it sits
 * next to the avatar in a 230px column.
 *
 * Renders nothing until there is XP to show, so a brand-new account does not
 * get a "Lv 1" chip advertising an empty page.
 */
export function XpSidebarBadge({
  userId,
  collapsed = false,
  className,
}: {
  userId: string;
  collapsed?: boolean;
  className?: string;
}) {
  const { data } = useXpBadge(userId);

  if (!data || data.totalXp <= 0) return null;

  const ring = `conic-gradient(hsl(${data.rankHue} 85% 60%) ${Math.round(data.progress * 360)}deg, var(--sd-line) 0deg)`;

  if (collapsed) {
    return (
      <Link
        href="/profile"
        aria-label={`Level ${data.level}, ${data.rank}. Open your profile.`}
        className={cn("mx-auto grid size-6 place-items-center rounded-full", className)}
        style={{ background: ring }}
      >
        <span className="grid size-[18px] place-items-center rounded-full bg-[var(--sd-box,var(--surface-raised))] font-mono text-[9px] font-semibold tabular-nums text-[var(--sd-ink,var(--ink))]">
          {data.level}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/profile"
      title={`${data.rank} · ${data.totalXp.toLocaleString()} XP · ${data.currentStreak}-day streak`}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2",
        "cursor-pointer-always transition-colors duration-[120ms] hover:bg-[var(--sd-hover)]",
        className,
      )}
    >
      <span className="grid size-5 place-items-center rounded-full" style={{ background: ring }}>
        <span className="grid size-[15px] place-items-center rounded-full bg-[var(--sd-box,var(--surface-raised))] font-mono text-[8px] font-semibold tabular-nums text-[var(--sd-ink,var(--ink))]">
          {data.level}
        </span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint,var(--ink-muted))]">
        {data.rank}
      </span>
    </Link>
  );
}
