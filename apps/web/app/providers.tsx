'use client';

import { ThemeProvider } from 'next-themes';

/**
 * Phase 6 Plan 06-01: client-only providers wrapper.
 *
 * next-themes 0.4.6 — attribute="class" toggles `.dark` on <html> so
 * Tailwind 4's @variant dark (added to globals.css) activates.
 * defaultTheme="system" + enableSystem honors user's OS preference on
 * first load (D-05). Once user toggles, preference persists in
 * localStorage under storageKey, overriding system from then on.
 *
 * suppressHydrationWarning on <html> in layout.tsx is REQUIRED — without
 * it, server-rendered HTML (no class) differs from client-hydrated HTML
 * (class added by next-themes blocking script), triggering a React
 * hydration warning (RESEARCH §1 Pitfall 1).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="hyperpolymath-theme"
    >
      {children}
    </ThemeProvider>
  );
}
