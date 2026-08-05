"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const ENTRIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "integrations", label: "Integrations" },
  { id: "api-keys", label: "API keys" },
  { id: "voice", label: "Voice" },
  { id: "messaging", label: "Messaging" },
  { id: "devices", label: "Devices" },
  { id: "govee-lights", label: "Lights" },
  { id: "tokens", label: "Tokens" },
  { id: "account", label: "Account" },
];

export function SettingsSectionNav() {
  const reducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string>(ENTRIES[0].id);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const elements = ENTRIES.map(({ id }) =>
      document.getElementById(id),
    ).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visibility = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        let winner: string | null = null;
        let best = 0;
        for (const [id, r] of visibility) {
          if (r > best) {
            best = r;
            winner = id;
          }
        }
        if (winner) setActiveId(winner);
      },
      {
        rootMargin: "-20% 0px -65% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );
    elements.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div className="sticky top-3 z-20 mb-8 pr-2">
      <div
        ref={railRef}
        // Craft register: the rail floats over the cards as it scrolls, so it
        // is glass chrome rather than another opaque plate. No bg-* utility
        // here — .craft-glass is unlayered and would win anyway.
        className="craft-glass sd-scroll-hover relative flex items-center gap-1 overflow-x-auto rounded-2xl p-1"
        style={{ scrollbarWidth: "none" }}
      >
        {ENTRIES.map((entry) => {
          const isActive = entry.id === activeId;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => go(entry.id)}
              aria-current={isActive ? "true" : undefined}
              className="relative isolate shrink-0 cursor-pointer-always rounded-lg focus:outline-none"
            >
              {isActive && (
                // The travelling plate. Segmented-control grammar: the active
                // segment is a raised white card, selection reads as depth.
                <motion.span
                  layoutId="settings-nav-pill"
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-lg bg-[var(--surface-raised)] shadow-[var(--shadow-card)]"
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 360, damping: 32 }
                  }
                />
              )}
              <span
                className={`block px-3 py-1.5 text-micro transition-colors duration-[160ms] ease-out ${
                  isActive
                    ? "font-medium text-[var(--ink)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {entry.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
