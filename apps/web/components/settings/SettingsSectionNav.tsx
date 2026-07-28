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
        className="sd-scroll-hover relative flex items-center gap-1 overflow-x-auto rounded-full border border-[var(--sd-line)] bg-[var(--sd-box)] px-2 py-1.5"
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
              className="relative isolate shrink-0 cursor-pointer-always rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
            >
              {isActive && (
                <motion.span
                  layoutId="settings-nav-pill"
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-full bg-[var(--sd-selected)]"
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 32,
                  }}
                />
              )}
              <span
                className={`block px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-150 ease-out ${
                  isActive
                    ? "text-[var(--sd-ink)]"
                    : "text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]"
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
