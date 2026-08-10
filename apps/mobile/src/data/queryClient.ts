// Singleton QueryClient — created here so non-React modules (SSE handlers,
// realtime channels, widget sync) can invalidate without a hook. The shell's
// root layout wraps the app in <QueryClientProvider client={queryClient}>.

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // The API clients resolve null on failure rather than throwing; hooks
      // convert null to thrown errors so retry/error states still work.
      refetchOnReconnect: true,
    },
  },
});
