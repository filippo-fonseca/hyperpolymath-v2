"use client";

import type { LinkPreviewRecord } from "@/lib/link-preview/types";
// Issue #221 — client hook that reads cached link-preview metadata for a set of
// URLs. Posts to /api/captures/link-preview, which returns whatever is cached and
// lazily schedules a fetch for anything new. While any requested URL is still
// missing or 'pending', we poll briefly so the first view resolves without a
// manual refresh; once everything settles, polling stops.
import { useQuery } from "@tanstack/react-query";

async function fetchPreviews(urls: string[]): Promise<LinkPreviewRecord[]> {
  const res = await fetch("/api/captures/link-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { previews?: LinkPreviewRecord[] };
  return data.previews ?? [];
}

export function useLinkPreviews(urls: string[]): Map<string, LinkPreviewRecord> {
  const key = Array.from(new Set(urls)).sort();
  const query = useQuery({
    queryKey: ["link-previews", key],
    queryFn: () => fetchPreviews(key),
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => {
      const data = q.state.data ?? [];
      const byUrl = new Set(data.map((p) => p.url));
      const anyMissing = key.some((u) => !byUrl.has(u));
      const anyPending = data.some((p) => p.status === "pending");
      // Keep polling (every 4s) only while something is still resolving.
      return anyMissing || anyPending ? 4000 : false;
    },
  });

  const map = new Map<string, LinkPreviewRecord>();
  for (const p of query.data ?? []) map.set(p.url, p);
  return map;
}
