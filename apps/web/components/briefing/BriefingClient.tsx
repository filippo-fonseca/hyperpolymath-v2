"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Newspaper, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BRIEFING_SECTION_ORDER,
  type BriefingSection,
} from "@/lib/briefing/types";
import type { BriefingPayload } from "@/lib/briefing/queries";
import { EmptyState } from "@/components/ui/EmptyState";
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
  const reduceMotion = useReducedMotion();
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
              <p className="text-meta text-[var(--ink-muted)]">
                {formatEditionDate(edition.editionDate)}
                <span className="mx-2 text-[var(--edge-strong)]">·</span>
                Updated {relativeTime(edition.generatedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh briefing"
            className="craft-chip shrink-0 cursor-pointer-always disabled:cursor-not-allowed disabled:opacity-60"
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

        {/* The dateline lede — a raised plate with a lavender left rule, so
            the edition's own words sit apart from the section stack below. */}
        {edition && (edition.headline || edition.summary) && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.25, 1, 0.5, 1] }
            }
            className="craft-card tint-lavender space-y-2 p-5"
            style={{ borderLeft: "3px solid var(--tint-edge)" }}
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
        <div className="craft-card rounded-2xl">
          <EmptyState
            size="section"
            className="tint-lavender"
            icon={<Newspaper strokeWidth={1.5} aria-hidden />}
            title="No briefing yet."
            description="Hit Refresh to generate today's digest."
            action={{ label: "Refresh", onClick: () => void handleRefresh() }}
          />
        </div>
      ) : sections.length === 0 ? (
        <div className="craft-card rounded-2xl">
          <EmptyState
            size="section"
            className="tint-lavender"
            icon={<Newspaper strokeWidth={1.5} aria-hidden />}
            title="This edition has no stories yet."
            description="Try refreshing to pull a fresh pass over the sources."
            action={{ label: "Refresh", onClick: () => void handleRefresh() }}
          />
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
