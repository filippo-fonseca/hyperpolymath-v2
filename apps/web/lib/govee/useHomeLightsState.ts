"use client";

/**
 * Live Govee home lights for the sidebar strip.
 * Polls `/api/studio/home` (cookie auth) — same envelope as the Studio HOME widget.
 */

import { useQuery } from "@tanstack/react-query";
import type { HomeLightsReceiptView } from "@/lib/govee/home-display";

export const HOME_LIGHTS_QUERY_KEY = ["home-lights-state"] as const;

export function useHomeLightsState(options?: { enabled?: boolean }) {
  return useQuery<HomeLightsReceiptView>({
    queryKey: HOME_LIGHTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/studio/home", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Home lights status failed (${res.status})`);
      }
      const body = (await res.json()) as {
        ok?: boolean;
        receipt?: HomeLightsReceiptView;
        error?: string;
      };
      if (!body.ok || !body.receipt) {
        throw new Error(body.error ?? "Home lights unavailable");
      }
      return body.receipt;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  });
}
