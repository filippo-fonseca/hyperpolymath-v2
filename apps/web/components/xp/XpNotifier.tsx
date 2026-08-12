"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { rankForLevel } from "@/lib/xp/levels";
import { useXpBadge } from "@/lib/xp/useXpBadge";
import { XpIcon, categoryColor } from "./xp-ui";

/**
 * The award notifier.
 *
 * Awards are handed out by Postgres triggers, so the tab that did the work
 * gets nothing back it could react to. This listens on the ledger instead and
 * pops a small badge when the total moves, wherever in the app you happen to
 * be.
 *
 * Two deliberate restraints. It never fires on the first payload after mount
 * (otherwise every navigation would replay your last award at you), and it
 * shows the delta rather than the individual event, so completing five tasks
 * in one sweep reads as one "+62 XP" instead of five stacked toasts.
 */
export function XpNotifier({ userId }: { userId: string }) {
  const { data } = useXpBadge(userId);
  const reduceMotion = useReducedMotion();

  const seen = useRef<{ total: number; level: number } | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    amount: number;
    label: string;
    icon: string;
    color: string;
  } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; rankName: string; hue: number; ascended: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!data) return;

    // First payload just establishes the baseline. Nothing to celebrate yet.
    if (seen.current === null) {
      seen.current = { total: data.totalXp, level: data.level };
      return;
    }

    const gained = data.totalXp - seen.current.total;
    const levelsGained = data.level - seen.current.level;
    const previousLevel = seen.current.level;
    seen.current = { total: data.totalXp, level: data.level };

    if (gained <= 0) return;

    setToast({
      id: Date.now(),
      amount: gained,
      label: data.latest?.label ?? "Earned XP",
      icon: data.latest?.icon ?? "Sparkles",
      color: data.latest ? categoryColor(data.latest.category) : "#38bdf8",
    });

    if (levelsGained > 0) {
      const rank = rankForLevel(data.level);
      setLevelUp({
        level: data.level,
        rankName: rank.name,
        hue: rank.hue,
        // A new rank is the rarer, louder event; the copy leans on it.
        ascended: rank.minLevel > rankForLevel(previousLevel).minLevel,
      });
    }
  }, [data]);

  // Auto-dismiss. Level-ups linger; ordinary awards get out of the way.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!levelUp) return;
    const id = setTimeout(() => setLevelUp(null), 5200);
    return () => clearTimeout(id);
  }, [levelUp]);

  return (
    <>
      {/* Bottom-centre so it never collides with the sonner stack or the
          floating JARVIS pill, both of which own bottom-right. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center">
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.id}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
              transition={reduceMotion ? { duration: 0.12 } : { duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              className="craft-glass-pop pointer-events-auto flex items-center gap-2.5 rounded-full py-2 pl-2.5 pr-4"
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full"
                style={{ background: `${toast.color}26`, color: toast.color }}
              >
                <XpIcon name={toast.icon} className="size-3.5" />
              </span>
              <span className="font-mono text-body font-semibold tabular-nums" style={{ color: toast.color }}>
                +{toast.amount} XP
              </span>
              <span className="text-micro text-[var(--ink-muted)]">{toast.label}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {levelUp ? (
          <motion.div
            key={levelUp.level}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-x-0 top-8 z-[61] flex justify-center px-4"
          >
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.93 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
              transition={reduceMotion ? { duration: 0.14 } : { type: "spring", stiffness: 320, damping: 26 }}
              className="craft-glass-pop pointer-events-auto flex items-center gap-4 rounded-2xl px-5 py-4"
              style={{ boxShadow: `0 18px 50px -12px hsl(${levelUp.hue} 80% 50% / 0.45)` }}
            >
              <span
                className="grid size-12 shrink-0 place-items-center rounded-xl font-mono text-xl font-semibold tabular-nums"
                style={{
                  background: `linear-gradient(140deg, hsl(${levelUp.hue} 85% 62%), hsl(${(levelUp.hue + 42) % 360} 82% 55%))`,
                  color: "white",
                }}
              >
                {levelUp.level}
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-subtitle font-semibold text-[var(--ink)]">
                  {levelUp.ascended ? `You are now ${levelUp.rankName}` : `Level ${levelUp.level}`}
                </span>
                <span className="block text-micro text-[var(--ink-muted)]">
                  {levelUp.ascended
                    ? "A new rank. That one took a while."
                    : "Another level down. Keep going."}{" "}
                  <Link
                    href="/profile"
                    className="underline decoration-[var(--edge)] underline-offset-4 hover:text-[var(--ink)]"
                  >
                    See your profile
                  </Link>
                </span>
              </span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
