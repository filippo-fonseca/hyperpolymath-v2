"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, PenLine, Hash } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { ConvertCaptureToTaskDialog } from "@/components/captures/ConvertCaptureToTaskDialog";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { Chip, ChipRow, EntityCardHeader, StatusPill } from "./entity-card";

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
export function RecentCapturesWidget({
  userId,
  initialCaptures,
  availableProjects,
}: Props) {
  const reduced = useReducedMotion();
  useTableSubscription("captures", userId);

  const { data: capturesData = initialCaptures } = useQuery({
    queryKey: [...tableKey("captures", userId), null] as const,
    queryFn: () => getCapturesForCurrentUser(),
    initialData: initialCaptures,
  });

  const recent = capturesData.slice(0, 6);
  const [convertTarget, setConvertTarget] = useState<CaptureWithLinks | null>(
    null,
  );

  return (
    <div className="flex flex-col h-full">
      <EntityCardHeader
        icon={<Sparkles size={15} strokeWidth={1.75} className="text-[var(--ink-muted)]" />}
        title="Captures"
        subtitle="Recent thoughts"
        pill={
          capturesData.length > 0 ? (
            <StatusPill tone="progress" label={`${capturesData.length} total`} />
          ) : (
            <StatusPill tone="idle" label="empty" />
          )
        }
        action={
          <Link
            href="/captures"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
          >
            All →
          </Link>
        }
      />
      {recent.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          Nothing captured yet. Type into JARVIS to drop a note.
        </p>
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
                className="group relative rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] p-3 flex flex-col gap-2 transition-[border-color] duration-150 hover:border-[var(--edge-hud)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
                    <SourceIcon
                      size={11}
                      strokeWidth={1.75}
                      style={
                        isJarvis
                          ? {
                              color: "var(--hud-cyan)",
                              filter:
                                "drop-shadow(0 0 4px color-mix(in oklch, var(--hud-cyan) 50%, transparent))",
                            }
                          : undefined
                      }
                    />
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
                      {isJarvis ? "JARVIS" : "Manual"}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[var(--ink-muted)] tabular-nums">
                    {formatDistanceToNowStrict(new Date(c.createdAt), {
                      addSuffix: false,
                    })}
                  </span>
                </div>
                <p className="font-serif text-[13px] leading-[1.45] text-[var(--ink)] line-clamp-3">
                  {c.content}
                </p>
                {(c.hashtags.length > 0 || c.projects.length > 0) && (
                  <ChipRow>
                    {c.hashtags.slice(0, 2).map((h) => (
                      <Chip
                        key={h.id}
                        icon={<Hash size={8} strokeWidth={2} className="shrink-0" />}
                      >
                        {h.displayName}
                      </Chip>
                    ))}
                    {c.projects.slice(0, 1).map((p) => (
                      <Chip key={p.id} className="max-w-[130px]">
                        {p.name}
                      </Chip>
                    ))}
                  </ChipRow>
                )}
                {isJarvis && (
                  <button
                    type="button"
                    onClick={() => setConvertTarget(c)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-[0.85] transition-opacity duration-150 ease-out font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--hud-cyan)] cursor-pointer-always bg-[var(--surface-raised)] px-1.5 py-0.5 rounded"
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
    </div>
  );
}
