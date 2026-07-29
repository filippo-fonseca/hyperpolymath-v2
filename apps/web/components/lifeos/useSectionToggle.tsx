"use client";

import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

/**
 * Persisted collapse state for a /lifeos section. Defaults to expanded so the
 * server-rendered markup matches first paint; the stored preference is read in
 * an effect after mount to avoid a hydration mismatch.
 */
export function usePersistedCollapse(storageKey: string) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {
      /* localStorage unavailable — stay expanded */
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle] as const;
}

export function CollapseChevron({
  collapsed,
  onClick,
  label,
}: {
  collapsed: boolean;
  onClick: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
      className="inline-flex items-center justify-center rounded-[8px] p-1 text-[var(--sd-ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] cursor-pointer-always"
    >
      <motion.span
        initial={false}
        animate={{ rotate: collapsed ? -90 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
        className="inline-flex"
      >
        <ChevronDown size={16} strokeWidth={2} />
      </motion.span>
    </button>
  );
}
