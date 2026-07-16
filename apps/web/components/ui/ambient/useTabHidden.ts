"use client";

import { useEffect, useState } from "react";

/**
 * True while the document is hidden (background tab, minimized window).
 *
 * The ambient layer uses this to pause its drift/bob loops so a backgrounded
 * tab never burns battery animating a decorative background. `prefers-reduced-
 * motion` is handled purely in CSS (see AmbientGlow / FocalOrb scoped styles),
 * so it needs no JS re-render; only the visibility state does.
 */
export function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return hidden;
}
