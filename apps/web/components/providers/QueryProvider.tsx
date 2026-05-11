"use client";

import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClient as QueryClientType,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { notifyVisible } from "@/lib/realtime/visibility";
import { tableKey } from "@/lib/realtime/query-keys";

function makeQueryClient(): QueryClientType {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // Realtime keeps data fresh; 30s tolerance for cold queries
        gcTime: 5 * 60_000, // 5 min
        refetchOnWindowFocus: false, // we own visibility recovery explicitly
        refetchOnMount: false, // initialData from SSR; Realtime drives invalidation
        retry: 1,
      },
    },
  });
}

/**
 * Single QueryClient per request, mounted at (app)/layout.tsx. Hosts the
 * one-and-only visibilitychange listener that recovers from Realtime gaps
 * (RT-03 / D-11) — every active (table, userId) registered via
 * useTableSubscription gets invalidated when the tab returns to visible.
 *
 * Devtools render in development only (D-07).
 */
export function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // useState ensures stable client across re-renders without re-creating on every render.
  const [queryClient] = useState(() => makeQueryClient());

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      notifyVisible((table, userId) => {
        void queryClient.invalidateQueries({
          queryKey: tableKey(table, userId),
        });
      });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      )}
    </QueryClientProvider>
  );
}
