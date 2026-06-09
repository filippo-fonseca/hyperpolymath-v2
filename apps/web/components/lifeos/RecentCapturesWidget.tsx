"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { ConvertCaptureToTaskDialog } from "@/components/captures/ConvertCaptureToTaskDialog";
import type { ProjectMultiSelectOption } from "@/components/shared/ProjectMultiSelect";

interface Props {
  userId: string;
  initialCaptures: CaptureWithLinks[];
  availableProjects: ProjectMultiSelectOption[];
}

/**
 * RecentCapturesWidget — at-a-glance + interactive tile for the LifeOS homepage.
 *
 * Quick task 260607-gox (2/3): converted from Server Component to client island.
 * Reuses the [...tableKey("captures", userId), null] query key from
 * CapturesClient so Realtime invalidation fans out to both surfaces.
 *
 * Hover-revealed "→ Task" action surfaces ONLY for JARVIS-created captures
 * (createdVia === "jarvis", preserving D-14 / JARVIS-13). Opens the existing
 * ConvertCaptureToTaskDialog verbatim — no parallel dialog invented; the
 * dialog handles its own invalidation across captures + tasks query keys.
 *
 * Aesthetic: opacity 0 → 0.85 on group hover, no scale, no glow.
 */
export function RecentCapturesWidget({
  userId,
  initialCaptures,
  availableProjects,
}: Props) {
  useTableSubscription("captures", userId);

  const { data: capturesData = initialCaptures } = useQuery({
    queryKey: [...tableKey("captures", userId), null] as const,
    queryFn: () => getCapturesForCurrentUser(),
    initialData: initialCaptures,
  });

  const recent = capturesData.slice(0, 5);

  const [convertTarget, setConvertTarget] = useState<CaptureWithLinks | null>(
    null,
  );

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full transition-[border-color,transform] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
          Recent captures
        </h3>
        <Link
          href="/captures"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {recent.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          Nothing captured yet. Type into JARVIS to drop a note.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 flex-1">
          {recent.map((c) => {
            const isJarvis = c.createdVia === "jarvis";
            return (
              <li
                key={c.id}
                className="group relative border-b border-[var(--edge)] pb-3 last:border-b-0 last:pb-0"
              >
                <p className="font-serif text-[14px] text-[var(--ink)] line-clamp-2 pr-14">
                  {c.content}
                </p>
                {isJarvis && (
                  <button
                    type="button"
                    onClick={() => setConvertTarget(c)}
                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-[0.85] transition-opacity duration-150 ease-out font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always"
                  >
                    → Task
                  </button>
                )}
              </li>
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
