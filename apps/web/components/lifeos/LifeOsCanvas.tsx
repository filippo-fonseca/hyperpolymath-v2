"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AreaIcon, WidgetIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { resetWidgetSpans, useHasCustomSpans } from "./useWidgetSpans";

type View = "widgets" | "areas";

const STORAGE_KEY = "lifeos:view";

interface Props {
  hero: React.ReactNode;
  quickSend: React.ReactNode;
  widgets: React.ReactNode;
  areas: React.ReactNode;
}

/**
 * LifeOsCanvas — the one-screen command deck (UI-CONTRACT-SD3 §2).
 *
 * Hero + quick-send always sit at the top. Below them a two-segment sd pill
 * toggle swaps EITHER the widget deck OR the areas tree into a single fixed
 * region — nothing stacks past one viewport. The whole column is `h-full`
 * against the AppShell scroll container (height = viewport − TopTabBar) and
 * `overflow-hidden`, so the page itself never scrolls; the swapped region owns
 * its own internal scroll where a tree or a list outgrows its cell.
 *
 * The chosen view is persisted at localStorage `lifeos:view` (default
 * `widgets`). The server renders both branches; the client mounts one. The
 * areas branch lazy-mounts on first switch (its sidebar-tree island shouldn't
 * pay to hydrate for a user who never leaves the widget deck).
 */
export function LifeOsCanvas({ hero, quickSend, widgets, areas }: Props) {
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>("widgets");
  // Once areas has been shown we keep it eligible to mount so a flip back and
  // forth doesn't thrash the tree; the region below still shows one at a time.
  const [areasSeen, setAreasSeen] = useState(false);

  // Read the persisted preference after mount (SSR renders the default so
  // hydration matches, then we reconcile).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "areas") {
        setView("areas");
        setAreasSeen(true);
      }
    } catch {
      /* localStorage unavailable — stay on widgets */
    }
  }, []);

  const select = useCallback((next: View) => {
    setView(next);
    if (next === "areas") setAreasSeen(true);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // Flip: opacity + 2px translate at the 220ms enter/exit step (§2.7).
  // Transform/opacity only (zero jank).
  const flip = reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 2 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] as const },
      };

  return (
    // The horizontal measure mirrors PageScaffold (§2.9: mx-auto, 1120px cap,
    // px-8) so the /lifeos H1 left edge lines up with every scaffold route,
    // while the vertical architecture stays the one-screen deck (h-full,
    // overflow-hidden, no scroll) the scaffold's scrolling anatomy cannot host.
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-8 pt-8">
      <div className="shrink-0">{hero}</div>
      <div className="shrink-0">{quickSend}</div>

      {/* Toggle row — the shared header for both views. The "open full view"
          shortcut only makes sense against the tree, so it rides the toggle
          contextually. */}
      <div className="mt-4 mb-4 flex shrink-0 items-center justify-between gap-4">
        <ViewToggle view={view} onSelect={select} reduced={!!reduced} />
        {view === "areas" ? (
          <Link
            href="/areas"
            className="text-micro font-medium text-[var(--ink-faint)] transition-colors duration-[160ms] hover:text-[var(--sd-ink)] cursor-pointer-always"
          >
            Open full view →
          </Link>
        ) : (
          <ResetLayoutVerb />
        )}
      </div>

      {/* The single swapped region — fixed height, internal scroll only. */}
      <div className="relative min-h-0 flex-1 pb-1">
        {view === "widgets" ? (
          <motion.div key="widgets" {...flip} className="h-full">
            {widgets}
          </motion.div>
        ) : (
          <motion.div key="areas" {...flip} className="h-full">
            {areasSeen ? areas : null}
          </motion.div>
        )}
      </div>
    </div>
  );
}

const SEGMENTS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "widgets", label: "Widgets", icon: <WidgetIcon size={16} /> },
  { id: "areas", label: "Areas", icon: <AreaIcon size={16} /> },
];

/**
 * Reset layout — a ghost micro verb that clears the persisted widget spans
 * back to the default deck. Only appears once the user has actually resized
 * something (custom spans present), so the header stays quiet by default.
 */
function ResetLayoutVerb() {
  const hasCustom = useHasCustomSpans();
  if (!hasCustom) return null;
  return (
    <button
      type="button"
      onClick={() => resetWidgetSpans()}
      className="text-micro font-medium text-[var(--ink-faint)] transition-colors duration-[160ms] hover:text-[var(--sd-ink)] cursor-pointer-always"
    >
      Reset layout
    </button>
  );
}

/**
 * Two-segment sd pill (UI-CONTRACT-SD3 §0 pill grammar). A single sliding
 * indicator (`layoutId`) glides between segments — transform-only, guarded by
 * reduced motion. Dimensional icons at 16px name each view; the active label
 * lifts to `--sd-ink`, the resting one sits faint.
 */
function ViewToggle({
  view,
  onSelect,
  reduced,
}: {
  view: View;
  onSelect: (v: View) => void;
  reduced: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="LifeOS view"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--sd-line)] bg-[var(--sd-input)] p-0.5"
    >
      {SEGMENTS.map((seg) => {
        const active = view === seg.id;
        return (
          <button
            key={seg.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(seg.id)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-meta font-medium",
              "cursor-pointer-always transition-colors duration-[160ms]",
              active
                ? "text-[var(--sd-ink)]"
                : "text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]",
            )}
          >
            {active && (
              <motion.span
                layoutId="lifeos-view-pill"
                aria-hidden
                className="absolute inset-0 rounded-full border border-[var(--sd-line)] bg-[var(--sd-box)]"
                transition={
                  reduced ? { duration: 0 } : { duration: 0.16, ease: [0.25, 1, 0.5, 1] }
                }
              />
            )}
            <span aria-hidden className="relative z-10 inline-flex">
              {seg.icon}
            </span>
            <span className="relative z-10">{seg.label}</span>
          </button>
        );
      })}
    </div>
  );
}
