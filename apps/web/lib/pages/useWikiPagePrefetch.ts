"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/** How long one hover's prefetch is trusted before another hover may renew it. */
const PREFETCH_TTL_MS = 25_000;

type PrefetchOptions = Parameters<ReturnType<typeof useRouter>["prefetch"]>[1];

/**
 * Warm a wiki page before it is opened.
 *
 * Opening a page is a double click (or a click from the journal rail), and
 * `router.push` on a dynamic route with nothing prefetched waits a full server
 * round trip before it can paint anything but the loading boundary. A `full`
 * prefetch on hover runs that render while the pointer is still travelling, so
 * by the time the click lands the RSC payload is usually already in the Router
 * Cache and the page swaps in without a skeleton at all.
 *
 * Also warms the BlockNote editor chunk once, on idle, since the page view
 * cannot paint its body until that client-only module has loaded.
 */
export function useWikiPagePrefetch() {
  const router = useRouter();
  const lastPrefetch = useRef(new Map<string, number>());

  useEffect(() => {
    const warm = () => {
      void import("@/components/pages/PageBlockEditor");
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(warm, 300);
    return () => clearTimeout(timer);
  }, []);

  return useCallback(
    (pageId: string) => {
      const now = Date.now();
      const last = lastPrefetch.current.get(pageId);
      if (last !== undefined && now - last < PREFETCH_TTL_MS) return;
      lastPrefetch.current.set(pageId, now);
      // PrefetchKind.FULL. The enum lives under next/dist, so pass its value.
      router.prefetch(`/wiki/${pageId}`, { kind: "full" } as unknown as PrefetchOptions);
    },
    [router]
  );
}
