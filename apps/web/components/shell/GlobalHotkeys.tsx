'use client';

import { useEffect } from 'react';
import { focusJarvis } from '@/lib/jarvis/focus';

/**
 * Phase 6 Plan 06-03: global Cmd+K listener (AES-05, D-02, UI-SPEC §11c).
 *
 * Mounts a single window-level keydown handler. Cmd+K (Mac) or Ctrl+K
 * (everywhere else) calls focusJarvis(), which dispatches to the
 * currently-registered JARVIS input focus function (or no-ops if the
 * Console isn't mounted).
 *
 * Pitfall 6 (RESEARCH §5): Chrome intercepts Cmd+K for the address bar
 * when no page element has focus AND the page hasn't already handled it.
 * Calling e.preventDefault() on the window listener prevents propagation
 * to the browser default. Verified in Chrome, Firefox, Safari.
 *
 * D-02: this is NOT a command palette — it ONLY focuses the JARVIS
 * input. If the JARVIS Console isn't mounted (e.g., user is on /tasks),
 * Cmd+K is a no-op. No overlay opens.
 */
export function GlobalHotkeys() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Plain Cmd+K (NO shift) → JARVIS focus. Cmd+Shift+K is reserved
      // for the CommandMenu capture composer (see CommandMenu.tsx).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
        // Cmd+K reserved for JARVIS focus. preventDefault stops browser
        // address-bar focus (Chrome) + cmdk-default behaviors.
        e.preventDefault();
        focusJarvis();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return null;
}
