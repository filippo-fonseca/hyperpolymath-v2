"use client";

import { getCapturesForCurrentUser } from "@/app/actions/captures";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { EmptyState } from "@/components/ui/EmptyState";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/** One row of the area's cross-project capture feed. */
export interface AreaCaptureRow {
  id: string;
  content: string;
  createdAt: string | Date;
  /** The capture's projects that live in this area (names for the meta line). */
  projects: { id: string; name: string }[];
}

const VISIBLE_ROWS = 6;

interface Props {
  userId: string;
  areaProjectIds: string[];
  initialCaptures: AreaCaptureRow[];
}

/**
 * Captures linked to the area's projects, newest first. Renders from the
 * server rows until the canonical ['captures', userId] snapshot resolves;
 * after that the cache is authoritative, so a capture Kiwi routes into one of
 * this area's projects surfaces here without a reload.
 */
export function AreaCapturesSection({ userId, areaProjectIds, initialCaptures }: Props) {
  // Same pair /captures subscribes to: capture rows plus the join table, so
  // linking an existing capture to one of this area's projects counts too.
  useTableSubscription("captures", userId);
  useTableSubscription("captures_projects", userId);

  const idSet = useMemo(() => new Set(areaProjectIds), [areaProjectIds]);
  const { data } = useQuery({
    queryKey: tableKey("captures", userId),
    queryFn: () => getCapturesForCurrentUser(),
    select: (rows) =>
      rows
        .filter((c) => c.projects.some((p) => idSet.has(p.id)))
        .map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          projects: c.projects.filter((p) => idSet.has(p.id)),
        })),
  });
  const rows = data ?? initialCaptures;

  if (rows.length === 0) {
    return (
      <EmptyState
        size="section"
        title="No captures linked to this area"
        description="Quick captures routed to this area's projects collect here."
      />
    );
  }

  const visible = rows.slice(0, VISIBLE_ROWS);
  const remaining = rows.length - visible.length;

  return (
    <div className="flex flex-col">
      {/* Craft row grammar: 28px rows on the sheet, faint hairlines, hover fill. */}
      <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]">
        {visible.map((c) => (
          <li
            key={c.id}
            className="flex min-h-9 items-center gap-4 rounded-lg px-2 py-1.5 hover:bg-[var(--hover)]"
          >
            <span className="min-w-0 flex-1 truncate text-meta text-[var(--ink)]">{c.content}</span>
            <span className="flex shrink-0 items-center text-micro text-[var(--ink-faint)]">
              {c.projects[0]?.name}
              <span aria-hidden className="mx-2 text-[var(--ink-faint)]">
                ·
              </span>
              <RelativeTime date={c.createdAt} className="text-micro tabular-nums" />
            </span>
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="px-2 pt-3 text-micro text-[var(--ink-faint)]">
          {remaining} earlier capture{remaining === 1 ? "" : "s"} on the captures page.
        </p>
      ) : null}
    </div>
  );
}
