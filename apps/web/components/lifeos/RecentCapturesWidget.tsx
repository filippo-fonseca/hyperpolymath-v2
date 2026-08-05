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
import { HashtagChip } from "@/components/captures/HashtagChip";
import { PersonChip } from "@/components/captures/PersonChip";
import { EntityLabelsProvider } from "@/components/references/EntityLabelsProvider";
import { EntityPill } from "@/components/references/EntityPill";
import { tokenizeContent } from "@/lib/captures/tokenize-content";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaptureIcon } from "@/components/ui/icons";
import { ActionLink, EntityCardHeader } from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

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

  const jarvisCount = capturesData.filter((c) => c.createdVia === "jarvis").length;

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<CaptureIcon size={20} />}
          title="Captures"
          subtitle="Recent thoughts"
          // aug-05 quiet pass: no pill — the total lives in the footer as
          // plain faint text.
          action={
            <Link href="/captures" className="group/action cursor-pointer-always">
              <ActionLink>All →</ActionLink>
            </Link>
          }
        />
        {recent.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <EmptyState
              size="inline"
              title="Nothing captured yet. Type into JARVIS to drop a note."
            />
          </div>
        ) : (
          // Flat sub-cards on --sd-input: no border-in-border double nesting (§6).
          // Compact cell (SD3 §2): a single-column stream that scrolls inside
          // the tile rather than a page-widening grid.
          <ul className="sd-scroll-hover -mr-2 mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-2">
            {recent.map((c, i) => {
              const isJarvis = c.createdVia === "jarvis";
              const SourceIcon = isJarvis ? Sparkles : PenLine;
              return (
                <motion.li
                  key={c.id}
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: reduced ? 0 : 0.02 * Math.min(i, 12),
                    duration: 0.22,
                    ease: [0.25, 1, 0.5, 1],
                  }}
                  className="group relative flex flex-col gap-1 rounded-[8px] bg-[var(--sd-input)] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[var(--sd-ink-faint)]">
                      <SourceIcon
                        size={11}
                        strokeWidth={1.75}
                        style={isJarvis ? { color: "var(--sd-accent)" } : undefined}
                      />
                      <span className="text-micro font-medium">
                        {isJarvis ? "Jarvis" : "Manual"}
                      </span>
                    </div>
                    {/* Mono survives on the timestamp (a numeric unit, §2.4). */}
                    <span className="font-mono text-micro tabular-nums text-[var(--sd-ink-faint)]">
                      {formatDistanceToNowStrict(new Date(c.createdAt), {
                        addSuffix: false,
                      })}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-meta text-[var(--sd-ink)]">
                    <CaptureLine capture={c} />
                  </p>
                  {/* aug-05 quiet pass: tags/projects are plain faint text,
                      not chips — one quiet plate per capture is the maximum. */}
                  {(c.hashtags.length > 0 || c.projects.length > 0) && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-[var(--sd-ink-faint)]">
                      {c.hashtags.slice(0, 2).map((h) => (
                        <span key={h.id} className="inline-flex items-center gap-0.5 truncate">
                          <Hash size={9} strokeWidth={2} className="shrink-0" aria-hidden />
                          {h.displayName}
                        </span>
                      ))}
                      {c.projects.slice(0, 1).map((p) => (
                        <span key={p.id} className="max-w-[130px] truncate">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {isJarvis && (
                    <button
                      type="button"
                      onClick={() => setConvertTarget(c)}
                      className="absolute right-2 top-2 cursor-pointer-always rounded bg-[var(--sd-box)] px-1.5 py-0.5 text-micro font-medium text-[var(--sd-ink-faint)] opacity-0 transition-opacity duration-[160ms] ease-out hover:text-[var(--sd-ink)] group-hover:opacity-100"
                    >
                      → Task
                    </button>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </WidgetBody>

      {/* Footer — one faint line of counts; the hashtag chips are gone (they
          were decoration, and the stream above already shows tags in place). */}
      <WidgetFooter>
        <span className="truncate text-micro tabular-nums text-[var(--sd-ink-faint)]">
          {capturesData.length} total
          {jarvisCount > 0 && ` · ${jarvisCount} via JARVIS`}
          {capturesData.length > recent.length &&
            ` · +${capturesData.length - recent.length} more`}
        </span>
      </WidgetFooter>

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
    </>
  );
}

/**
 * One capture's body, with the same chips the /captures feed shows.
 *
 * This used to render `{c.content}` raw, so the same capture read one way on
 * /captures (chips) and another here (literal `#tag` and `@name`) — a shipped
 * inconsistency that adding a fourth syntax would only have widened. Routing
 * it through the shared tokenizer is what keeps one capture looking like one
 * capture wherever it appears.
 */
function CaptureLine({ capture }: { capture: CaptureWithLinks }) {
  const segments = tokenizeContent(capture.content, {
    hashtagDisplay: new Map(capture.hashtags.map((h) => [h.name, h.displayName])),
    personNames: capture.people?.map((p) => p.name) ?? [],
  });
  return (
    <EntityLabelsProvider text={capture.content}>
      {segments.map((seg, i) => {
        if (seg.kind === "hashtag") {
          return <HashtagChip key={i} displayName={seg.display} asButton={false} />;
        }
        if (seg.kind === "person") {
          return <PersonChip key={i} name={seg.display} asButton={false} />;
        }
        if (seg.kind === "entityRef") {
          return <EntityPill key={i} entityRef={seg.ref} />;
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </EntityLabelsProvider>
  );
}
