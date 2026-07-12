"use client";

import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { ConvertCaptureToTaskDialog } from "@/components/captures/ConvertCaptureToTaskDialog";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { EmptyState, SectionHeader } from "@/components/spacedrive";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Hash, PenLine, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

interface Props {
  userId: string;
  initialCaptures: CaptureWithLinks[];
  availableProjects: ProjectMultiSelectOption[];
}

/**
 * RecentCapturesWidget — full-width bottom tile in the bento grid.
 *
 * Reads as a horizontal stream of recent thoughts. Source glyph (sparkle for
 * JARVIS, pen for manual), relative timestamp, content, then up to two
 * hashtag chips. Hover reveals the "→ Task" affordance ONLY for JARVIS
 * captures (D-14 / JARVIS-13). Cards stagger in on mount.
 */
export function RecentCapturesWidget({ userId, initialCaptures, availableProjects }: Props) {
  const reduced = useReducedMotion();
  useTableSubscription("captures", userId);

  const { data: capturesData = initialCaptures } = useQuery({
    queryKey: [...tableKey("captures", userId), null] as const,
    queryFn: () => getCapturesForCurrentUser(),
    initialData: initialCaptures,
  });

  const recent = capturesData.slice(0, 6);
  const [convertTarget, setConvertTarget] = useState<CaptureWithLinks | null>(null);

  return (
    <section aria-labelledby="lifeos-capture-stream-title" className="flex flex-col h-full">
      <h3 id="lifeos-capture-stream-title" className="sr-only">
        Capture stream
      </h3>
      <SectionHeader
        title="Capture stream"
        action={
          <div className="flex items-center gap-3">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--deck-ink-dull)] tabular-nums">
              {capturesData.length} total
            </span>
            <Link
              href="/captures"
              className="rounded-sm px-1 py-0.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              All →
            </Link>
          </div>
        }
        className="mb-4"
      />
      {recent.length === 0 ? (
        <EmptyState
          title="Nothing captured yet."
          description="Type into Quick Send to drop a note into the stream."
          className="min-h-0 items-start px-0 py-8 text-left"
        />
      ) : (
        <ul className="grid grid-cols-1 @lg/main:grid-cols-2 @3xl/main:grid-cols-3 gap-3">
          {recent.map((c, i) => {
            const isJarvis = c.createdVia === "jarvis";
            const SourceIcon = isJarvis ? Sparkles : PenLine;
            return (
              <motion.li
                key={c.id}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduced ? 0 : 0.04 * i,
                  duration: 0.28,
                  ease: [0.25, 1, 0.5, 1],
                }}
                className="group relative flex flex-col gap-2 rounded-md border border-[var(--deck-line)] bg-[var(--deck-panel-deep)] p-3 transition-[border-color,background-color] [transition-duration:var(--dur-hover)] hover:border-[var(--deck-accent-faint)] hover:bg-[var(--deck-hover)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[var(--deck-ink-dull)]">
                    <SourceIcon
                      size={11}
                      strokeWidth={1.75}
                      style={
                        isJarvis
                          ? {
                              color: "var(--deck-accent)",
                            }
                          : undefined
                      }
                    />
                    <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.14em]">
                      {isJarvis ? "JARVIS" : "Manual"}
                    </span>
                  </div>
                  <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.10em] text-[var(--deck-ink-dull)] tabular-nums">
                    {formatDistanceToNowStrict(new Date(c.createdAt), {
                      addSuffix: false,
                    })}
                  </span>
                </div>
                <p className="font-[family-name:var(--font-sans)] text-[13px] leading-[1.45] text-[var(--deck-ink)] line-clamp-3">
                  {c.content}
                </p>
                {(c.hashtags.length > 0 || c.projects.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {c.hashtags.slice(0, 2).map((h) => (
                      <span
                        key={h.id}
                        className="inline-flex items-center gap-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.10em] text-[var(--deck-ink-dull)]"
                      >
                        <Hash size={8} strokeWidth={2} />
                        {h.displayName}
                      </span>
                    ))}
                    {c.projects.slice(0, 1).map((p) => (
                      <span
                        key={p.id}
                        className="max-w-[120px] truncate font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.10em] text-[var(--deck-ink-dull)]"
                      >
                        / {p.name}
                      </span>
                    ))}
                  </div>
                )}
                {isJarvis && (
                  <button
                    type="button"
                    onClick={() => setConvertTarget(c)}
                    className="absolute right-2 top-2 rounded bg-[var(--deck-panel)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-accent)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100"
                  >
                    → Task
                  </button>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
      {convertTarget && (
        <ConvertCaptureToTaskDialog
          open={!!convertTarget}
          onOpenChange={(open) => {
            if (!open) setConvertTarget(null);
          }}
          capture={{ id: convertTarget.id, content: convertTarget.content }}
          existingProjectIds={convertTarget.projects.map((p) => p.id)}
          availableProjects={availableProjects}
        />
      )}
    </section>
  );
}
