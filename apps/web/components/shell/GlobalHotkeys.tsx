'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { focusJarvis } from '@/lib/jarvis/focus';
import { readSplitScreen } from '@/lib/ui/useSplitScreen';

const JARVIS_PATH = '/today';
const FALLBACK_LEFT_PATH = '/lifeos';
const TAB_STORAGE_KEY = 'top-tab-last-route';

/**
 * Phase 6 Plan 06-03: global Cmd+K listener (AES-05, D-02, UI-SPEC §11c).
 *
 * Cmd/Ctrl+K → focus JARVIS (existing behavior).
 *
 * Ctrl+1 / Ctrl+2 → switch left/right tab (new). Ctrl-only on purpose so the
 * shortcut is consistent across macOS and the rest of OSes; on macOS Cmd+1/2
 * is reserved by browsers for tab switching, which we don't want to fight.
 * Both no-op while split-screen is on (both panes are already visible).
 */
export function GlobalHotkeys() {
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd/Ctrl+K → JARVIS focus.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        focusJarvis();
        return;
      }

      // Ctrl+1 / Ctrl+2 → tab swap. Not Cmd — browsers claim Cmd+digit on Mac.
      // Skip Alt and Shift to avoid hijacking native browser combos.
      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key !== '1' && e.key !== '2') return;

      // Skip when typing — let inputs see the digit.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // No-op while split-screen is on (both routes are visible).
      if (readSplitScreen()) return;

      e.preventDefault();
      if (e.key === '2') {
        router.push(JARVIS_PATH);
      } else {
        let dest: string = FALLBACK_LEFT_PATH;
        try {
          const stored = localStorage.getItem(TAB_STORAGE_KEY);
          if (stored && stored !== JARVIS_PATH) dest = stored;
        } catch {
          // ignore
        }
        if (dest === pathname) return;
        router.push(dest);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pathname, router]);

  return null;
}
