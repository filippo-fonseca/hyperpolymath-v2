import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { userXp, xpEvents, xpRules } from "@/lib/db/schema";
import { levelFromXp, nextRankForLevel, rankForLevel } from "@/lib/xp/levels";
import { XP_CATEGORIES, type XpCategory, metaForKind } from "@/lib/xp/rules";

/**
 * Everything the XP screens need, in one round trip.
 *
 * The ledger is small by construction (daily caps keep it in the low hundreds
 * of rows per day at the absolute ceiling), so a year's window is a few
 * thousand rows. That is cheap enough to fetch whole and re-aggregate on the
 * client when the range pill changes, which is the same trade /insights
 * already makes.
 */

export const XP_WINDOW_DAYS = 365;

export interface XpLedgerRow {
  id: string;
  kind: string;
  label: string;
  icon: string;
  category: XpCategory;
  amount: number;
  sourceType: string | null;
  sourceId: string | null;
  occurredAt: string;
  localDate: string;
  metadata: Record<string, unknown>;
}

export interface XpDayRow {
  date: string;
  total: number;
  /** Per-category totals for that day; every category is present, zeroed. */
  byCategory: Record<XpCategory, number>;
}

export interface XpRuleRow {
  kind: string;
  label: string;
  hint: string;
  icon: string;
  category: XpCategory;
  baseAmount: number;
  dailyCap: number | null;
}

export interface XpOverview {
  totalXp: number;
  level: number;
  levelLabel: string;
  rank: ReturnType<typeof rankForLevel>;
  nextRank: ReturnType<typeof nextRankForLevel>;
  progress: ReturnType<typeof levelFromXp>;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  firstEventAt: string | null;
  /** XP earned today, in the user's local day as the ledger recorded it. */
  earnedToday: number;
  earnedThisWeek: number;
  /** Highest single-day total in the window. */
  bestDay: { date: string; total: number } | null;
  /** Number of distinct days with at least one award, over the window. */
  activeDays: number;
  byCategory: Record<XpCategory, number>;
  byKind: { kind: string; label: string; icon: string; category: XpCategory; total: number; count: number }[];
  days: XpDayRow[];
  recent: XpLedgerRow[];
  rules: XpRuleRow[];
}

function emptyByCategory(): Record<XpCategory, number> {
  return Object.fromEntries(XP_CATEGORIES.map((c) => [c, 0])) as Record<XpCategory, number>;
}

/** `Date` → `YYYY-MM-DD` without dragging in a timezone conversion. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getXpOverview(userId: string): Promise<XpOverview> {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - XP_WINDOW_DAYS);

  const [totals, events, rules] = await Promise.all([
    db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1),
    db
      .select({
        id: xpEvents.id,
        kind: xpEvents.kind,
        amount: xpEvents.amount,
        category: xpEvents.category,
        sourceType: xpEvents.sourceType,
        sourceId: xpEvents.sourceId,
        occurredAt: xpEvents.occurredAt,
        localDate: xpEvents.localDate,
        metadata: xpEvents.metadata,
      })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, userId), gte(xpEvents.localDate, isoDay(windowStart))))
      .orderBy(desc(xpEvents.occurredAt)),
    db.select().from(xpRules).orderBy(desc(xpRules.baseAmount)),
  ]);

  const row = totals[0];
  // The ledger is the truth. If user_xp is somehow missing (a user whose first
  // award predates this table, say) the window sum is still a sane answer.
  const totalXp = row ? Number(row.totalXp) : events.reduce((sum, e) => sum + e.amount, 0);
  const progress = levelFromXp(totalXp);

  const byCategory = emptyByCategory();
  const dayMap = new Map<string, XpDayRow>();
  const kindMap = new Map<string, { total: number; count: number }>();

  for (const e of events) {
    const meta = metaForKind(e.kind);
    // Trust the row's own category when it is one we know, so events written by
    // a newer migration still land somewhere sensible.
    const category = (XP_CATEGORIES as string[]).includes(e.category)
      ? (e.category as XpCategory)
      : meta.category;

    byCategory[category] += e.amount;

    let day = dayMap.get(e.localDate);
    if (!day) {
      day = { date: e.localDate, total: 0, byCategory: emptyByCategory() };
      dayMap.set(e.localDate, day);
    }
    day.total += e.amount;
    day.byCategory[category] += e.amount;

    const k = kindMap.get(e.kind) ?? { total: 0, count: 0 };
    k.total += e.amount;
    k.count += 1;
    kindMap.set(e.kind, k);
  }

  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const today = row?.lastActiveDate ?? isoDay(new Date());
  const earnedToday = dayMap.get(isoDay(new Date()))?.total ?? 0;

  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartISO = isoDay(weekStart);
  const earnedThisWeek = days
    .filter((d) => d.date >= weekStartISO)
    .reduce((sum, d) => sum + d.total, 0);

  const bestDay = days.reduce<{ date: string; total: number } | null>(
    (best, d) => (best === null || d.total > best.total ? { date: d.date, total: d.total } : best),
    null,
  );

  const byKind = [...kindMap.entries()]
    .map(([kind, v]) => {
      const meta = metaForKind(kind);
      return { kind, label: meta.label, icon: meta.icon, category: meta.category, ...v };
    })
    .sort((a, b) => b.total - a.total);

  return {
    totalXp,
    level: progress.level,
    levelLabel: `Level ${progress.level}`,
    rank: rankForLevel(progress.level),
    nextRank: nextRankForLevel(progress.level),
    progress,
    currentStreak: row?.currentStreak ?? 0,
    longestStreak: row?.longestStreak ?? 0,
    lastActiveDate: today,
    firstEventAt: row?.firstEventAt ? row.firstEventAt.toISOString() : null,
    earnedToday,
    earnedThisWeek,
    bestDay,
    activeDays: days.length,
    byCategory,
    byKind,
    days,
    recent: events.slice(0, 60).map((e) => {
      const meta = metaForKind(e.kind);
      return {
        id: e.id,
        kind: e.kind,
        label: meta.label,
        icon: meta.icon,
        category: meta.category,
        amount: e.amount,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        occurredAt: e.occurredAt.toISOString(),
        localDate: e.localDate,
        metadata: (e.metadata ?? {}) as Record<string, unknown>,
      };
    }),
    rules: rules
      .filter((r) => r.active)
      .map((r) => {
        const meta = metaForKind(r.kind);
        return {
          kind: r.kind,
          label: meta.label,
          hint: meta.hint,
          icon: meta.icon,
          category: meta.category,
          baseAmount: r.baseAmount,
          dailyCap: r.dailyCap,
        };
      }),
  };
}

/**
 * Just the numbers the header pill needs. Kept separate from the full overview
 * so the shell does not pay for a year of ledger on every page load.
 */
export async function getXpBadge(
  userId: string,
): Promise<{ totalXp: number; level: number; progress: number; rank: string; currentStreak: number }> {
  const [row] = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);
  const totalXp = row ? Number(row.totalXp) : 0;
  const p = levelFromXp(totalXp);
  return {
    totalXp,
    level: p.level,
    progress: p.progress,
    rank: rankForLevel(p.level).name,
    currentStreak: row?.currentStreak ?? 0,
  };
}

/**
 * Award XP from application code.
 *
 * Only for actions with no table behind them to hang a trigger on — in
 * practice that means Google Calendar events, since gcal is the store of
 * record and nothing lands in Postgres. Everything else is covered by the
 * triggers in migration 0044, and should stay that way: adding call sites here
 * for things that could be triggers is how coverage silently rots.
 *
 * Never throws. XP is a garnish, and failing to award it must not roll back or
 * fail the real action that earned it.
 */
export async function awardXp(params: {
  userId: string;
  kind: string;
  dedupeKey: string;
  category: XpCategory;
  sourceType?: string | null;
  sourceId?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT public.award_xp(
        ${params.userId}::uuid,
        ${params.kind}::text,
        ${params.dedupeKey}::text,
        ${params.category}::text,
        ${params.sourceType ?? null}::text,
        ${params.sourceId ?? null}::uuid,
        ${params.amount ?? null}::integer,
        ${JSON.stringify(params.metadata ?? {})}::jsonb
      ) AS awarded
    `);
    const rows = result as unknown as { awarded: number }[];
    return Number(rows?.[0]?.awarded ?? 0);
  } catch (error) {
    console.error("[xp] award failed", { kind: params.kind, error });
    return 0;
  }
}
