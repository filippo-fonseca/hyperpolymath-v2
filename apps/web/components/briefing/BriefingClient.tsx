"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BRIEFING_SECTION_ORDER,
  type BriefingSection,
} from "@/lib/briefing/types";
import type { BriefingPayload } from "@/lib/briefing/queries";
import { cn } from "@/lib/utils";
import { BriefingSectionCard, type BriefingItemRow } from "./BriefingSectionCard";

interface Props {
  /** Signed-in user id — scopes the query key. */
  userId: string;
  /** SSR-seeded latest edition + items (no flash on first paint). */
  initial: BriefingPayload;
}

/** Formats a compact relative time, e.g. "just now", "3m ago", "2h ago". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Formats an editionDate (YYYY-MM-DD) as a long editorial dateline. */
function formatEditionDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * /briefing client island — TanStack Query owns the edition after SSR seed.
 *
 * Reads GET /api/briefing (initialData from SSR so there's no fetch on mount),
 * groups items by section in BRIEFING_SECTION_ORDER, and drives the Refresh
 * button which POSTs /api/briefing/refresh then invalidates the query.
 */
export function BriefingClient({ userId, initial }: Props) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data } = useQuery({
    queryKey: ["briefing", userId] as const,
    queryFn: async (): Promise<BriefingPayload> => {
      const res = await fetch("/api/briefing", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load briefing");
      return (await res.json()) as BriefingPayload;
    },
    initialData: initial,
    initialDataUpdatedAt: Date.now(),
  });

  const edition = data?.edition ?? null;
  const items = data?.items ?? [];

  // Group items into non-empty sections, preserving the canonical render order
  // and each section's internal orderIndex.
  const sections = useMemo(() => {
    const bySection = new Map<BriefingSection, BriefingItemRow[]>();
    for (const item of items) {
      const bucket = bySection.get(item.section);
      if (bucket) bucket.push(item);
      else bySection.set(item.section, [item]);
    }
    return BRIEFING_SECTION_ORDER.flatMap((section) => {
      const rows = bySection.get(section);
      if (!rows || rows.length === 0) return [];
      const sorted = [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
      return [{ section, rows: sorted }];
    });
  }, [items]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/briefing/refresh", { method: "POST" });
      if (!res.ok) {
        const message =
          res.status === 503
            ? "Briefing is unavailable — no OpenAI key configured."
            : res.status === 403
              ? "You don't have permission to refresh the briefing."
              : "Failed to refresh the briefing.";
        toast.error(message);
        return;
      }
      const body = (await res.json()) as { editionId: string; itemCount: number };
      await queryClient.invalidateQueries({ queryKey: ["briefing", userId] });
      toast.success(`Digest refreshed — ${body.itemCount} stories curated.`);
    } catch {
      toast.error("Failed to refresh the briefing.");
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, userId]);

  return (
    <>
      {/* Masthead — editorial header for the edition. */}
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="font-serif text-5xl font-semibold leading-none tracking-tight text-[var(--ink)]">
              Briefing
            </h1>
            {edition && (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {formatEditionDate(edition.editionDate)}
                <span className="mx-2 text-[var(--edge)]">·</span>
                Updated {relativeTime(edition.generatedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh briefing"
            className={cn(
              "glass-button inline-flex items-center gap-2 rounded-[0.7rem] px-4 h-10 shrink-0",
              "font-serif text-[14px] text-[var(--ink)]",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            <RefreshCw
              size={15}
              strokeWidth={1.75}
              className={cn(refreshing && "animate-spin")}
              aria-hidden="true"
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {edition && (edition.headline || edition.summary) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-2 border-l-2 border-[var(--hud-cyan)] pl-4"
          >
            {edition.headline && (
              <h2 className="font-serif text-2xl font-medium leading-snug text-[var(--ink)]">
                {edition.headline}
              </h2>
            )}
            {edition.summary && (
              <p className="font-serif text-base leading-relaxed text-[var(--ink-muted)]">
                {edition.summary}
              </p>
            )}
          </motion.div>
        )}
      </header>

      {edition === null ? (
        <div className="glass-tile rounded-xl px-8 py-14 text-center">
          <p className="font-serif text-xl text-[var(--ink)]">No briefing yet.</p>
          <p className="mt-2 font-serif text-base text-[var(--ink-muted)]">
            Hit Refresh to generate today's digest.
          </p>
        </div>
      ) : sections.length === 0 ? (
        <div className="glass-tile rounded-xl px-8 py-14 text-center">
          <p className="font-serif text-lg text-[var(--ink-muted)]">
            This edition has no stories yet — try refreshing.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(({ section, rows }) => (
            <BriefingSectionCard key={section} section={section} items={rows} />
          ))}
        </div>
      )}
    </>
  );
}
