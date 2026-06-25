"use client";

/**
 * ProductTour — Skippable, spotlight-based guided walkthrough.
 *
 * Architecture:
 *   - Reads/writes two localStorage keys:
 *       "hp_tour_pending"  → set by onboarding-flow before completeOnboarding()
 *       "hp_tour_v1_done"  → set on complete or skip; prevents re-show
 *   - Locates DOM targets via data-tour="<key>" attributes spread across the
 *     shell components (PersistentNav, TopTabBar).
 *   - Renders a fullscreen overlay with a cut-out spotlight rectangle and a
 *     floating coachmark card anchored near the target.
 *   - Fully keyboard accessible: Esc skips, Enter/Space advances.
 *   - Zero external dependencies; pure React + CSS tokens from globals.css.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

const TOUR_PENDING_KEY = "hp_tour_pending";
const TOUR_DONE_KEY = "hp_tour_v1_done";
/**
 * In-tab signal that onboarding just set the pending flag. The `storage`
 * event only fires across tabs, so without this the tour wouldn't trigger
 * until a full reload — AppShell stays mounted through the post-onboarding
 * client-side `redirect()` so ProductTour's mount-time check never re-runs.
 */
export const TOUR_PENDING_EVENT = "hp:tour-pending";

/* ── Tour step definitions ── */

interface TourStep {
  /** data-tour value on the target element */
  target: string;
  title: string;
  body: string;
  /** Where to place the coachmark card relative to the target */
  placement: "right" | "left" | "bottom" | "top";
  /** accent color for the step */
  accent: "violet" | "blue" | "cyan";
}

const STEPS: TourStep[] = [
  {
    target: "nav-lifeos",
    title: "LifeOS dashboard",
    body: "Your home base. See everything — tasks, captures, habits, training, and calendar — at a glance.",
    placement: "right",
    accent: "violet",
  },
  {
    target: "nav-tasks",
    title: "Tasks",
    body: "All your to-dos in one place, organized by area and project. JARVIS creates tasks here when you say things like \"remind me to…\"",
    placement: "right",
    accent: "blue",
  },
  {
    target: "nav-captures",
    title: "Captures",
    body: "Thoughts, links, and quick notes that don't fit anywhere else. JARVIS never paraphrases these — your words land verbatim.",
    placement: "right",
    accent: "violet",
  },
  {
    target: "nav-journaling",
    title: "Journal",
    body: "Daily pages with a full rich-text editor. Review your days, reflect, and link ideas to areas and projects.",
    placement: "right",
    accent: "blue",
  },
  {
    target: "nav-calendar",
    title: "Calendar",
    body: "Your Google Calendar, embedded. Events you schedule through JARVIS land here automatically.",
    placement: "right",
    accent: "cyan",
  },
  {
    target: "top-tab-jarvis",
    title: "JARVIS is always here",
    body: "The JARVIS tab in the top bar is your command line. Click it or press ⌃2 to open the agent from anywhere in the app.",
    placement: "bottom",
    accent: "cyan",
  },
  {
    target: "top-split-toggle",
    title: "Split-screen mode",
    body: "Click this icon to open JARVIS alongside any other view. Perfect for chatting with JARVIS while reviewing tasks.",
    placement: "bottom",
    accent: "violet",
  },
];

/* ── Geometry helpers ── */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 10;

function padRect(r: Rect): Rect {
  return {
    top: r.top - SPOTLIGHT_PAD,
    left: r.left - SPOTLIGHT_PAD,
    width: r.width + SPOTLIGHT_PAD * 2,
    height: r.height + SPOTLIGHT_PAD * 2,
  };
}

function getCardPosition(
  rect: Rect,
  placement: TourStep["placement"],
  cardW: number,
  cardH: number,
  vpW: number,
  vpH: number
): { top: number; left: number } {
  const GAP = 18;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "right":
      top = rect.top + rect.height / 2 - cardH / 2;
      left = rect.left + rect.width + GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - cardH / 2;
      left = rect.left - cardW - GAP;
      break;
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - cardW / 2;
      break;
    case "top":
      top = rect.top - cardH - GAP;
      left = rect.left + rect.width / 2 - cardW / 2;
      break;
  }

  // Clamp within viewport with 16px margin
  const M = 16;
  top = Math.max(M, Math.min(top, vpH - cardH - M));
  left = Math.max(M, Math.min(left, vpW - cardW - M));
  return { top, left };
}

/* ── Accent color resolver ── */

const ACCENT_COLORS: Record<TourStep["accent"], { color: string; glow: string; bg: string; border: string }> = {
  violet: {
    color: "var(--ink-violet)",
    glow: "color-mix(in oklch, var(--ink-violet) 35%, transparent)",
    bg: "color-mix(in oklch, var(--ink-violet) 8%, transparent)",
    border: "color-mix(in oklch, var(--ink-violet) 22%, transparent)",
  },
  blue: {
    color: "var(--ink-blue)",
    glow: "color-mix(in oklch, var(--ink-blue) 35%, transparent)",
    bg: "color-mix(in oklch, var(--ink-blue) 8%, transparent)",
    border: "color-mix(in oklch, var(--ink-blue) 22%, transparent)",
  },
  cyan: {
    color: "var(--hud-cyan)",
    glow: "var(--hud-cyan-glow)",
    bg: "color-mix(in oklch, var(--hud-cyan) 8%, transparent)",
    border: "color-mix(in oklch, var(--hud-cyan) 22%, transparent)",
  },
};

/* ── Main component ── */

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const step = STEPS[stepIdx];

  const markDone = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_PENDING_KEY);
      localStorage.setItem(TOUR_DONE_KEY, "1");
    } catch {
      // ignore
    }
    setActive(false);
  }, []);

  // Re-measure target on step change or viewport resize/scroll
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      // Target missing — skip this step silently
      if (stepIdx < STEPS.length - 1) {
        setStepIdx((i) => i + 1);
      } else {
        markDone();
      }
      return;
    }
    const r = el.getBoundingClientRect();
    const paddedRect: Rect = padRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    setTargetRect(paddedRect);

    // Determine card dimensions (estimate before render; update after)
    const cardW = 300;
    const cardH = cardRef.current?.offsetHeight ?? 160;
    const pos = getCardPosition(paddedRect, step.placement, cardW, cardH, window.innerWidth, window.innerHeight);
    setCardPos(pos);
  }, [step, stepIdx, markDone]);

  // Re-measure after card renders so position is accurate
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      measure();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, stepIdx, measure]);

  // Resize + scroll listener
  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  // Esc key
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        markDone();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, markDone]);

  // Bootstrap: fire on mount when the pending flag is set, AND re-check on the
  // in-tab `hp:tour-pending` event so onboarding can trigger the tour without
  // a full reload (AppShell stays mounted through the client-side redirect).
  useEffect(() => {
    function checkPending() {
      try {
        const pending = localStorage.getItem(TOUR_PENDING_KEY);
        const done = localStorage.getItem(TOUR_DONE_KEY);
        if (pending === "1" && !done) {
          localStorage.removeItem(TOUR_PENDING_KEY);
          setActive(true);
          setStepIdx(0);
        }
      } catch {
        // storage unavailable
      }
    }
    checkPending();
    window.addEventListener(TOUR_PENDING_EVENT, checkPending);
    return () => window.removeEventListener(TOUR_PENDING_EVENT, checkPending);
  }, []);

  const goNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      markDone();
    }
  };

  const goPrev = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  };

  if (!active) return null;

  const accent = ACCENT_COLORS[step.accent];
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  // Clip-path spotlight: the SVG approach uses a rect with a hole cut out.
  const vpW = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 900;

  const sr = targetRect;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Product tour step ${stepIdx + 1} of ${STEPS.length}: ${step.title}`}
      className="fixed inset-0 z-[9999] pointer-events-auto"
      style={{ isolation: "isolate" }}
    >
      {/* ── Dimming overlay with spotlight hole via SVG clipPath ── */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: "block" }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* White = visible (the dim) */}
            <rect width={vpW} height={vpH} fill="white" />
            {/* Black = hole (the spotlight) */}
            {sr && (
              <rect
                x={sr.left}
                y={sr.top}
                width={sr.width}
                height={sr.height}
                rx={10}
                ry={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Overlay rect masked so the target "shines through" */}
        <rect
          width={vpW}
          height={vpH}
          fill="oklch(10% 0.005 240 / 0.72)"
          mask="url(#tour-spotlight-mask)"
        />
        {/* Spotlight border glow */}
        {sr && (
          <rect
            x={sr.left}
            y={sr.top}
            width={sr.width}
            height={sr.height}
            rx={10}
            ry={10}
            fill="none"
            stroke={accent.color}
            strokeWidth="1.5"
            style={{ filter: `drop-shadow(0 0 8px ${accent.glow})` }}
          />
        )}
      </svg>

      {/* Transparent click-catcher behind the card so clicks on the dim area skip */}
      <div
        className="absolute inset-0"
        onClick={markDone}
        aria-label="Skip tour"
        role="button"
        tabIndex={-1}
        style={{ cursor: "default" }}
      />

      {/* ── Coachmark card ── */}
      {cardPos && (
        <div
          ref={cardRef}
          className="absolute glass-tile rounded-2xl"
          style={{
            top: cardPos.top,
            left: cardPos.left,
            width: 300,
            zIndex: 1,
            // Override glass-tile glow with step accent
            ["--glass-glow-color" as string]: accent.color,
            boxShadow: `var(--glass-raise), var(--glass-drop), inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), inset 0 0 24px ${accent.bg}, 0 0 32px ${accent.glow}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Accent stripe top edge */}
          <div
            className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl"
            aria-hidden="true"
            style={{
              background: `linear-gradient(90deg, ${accent.color} 0%, color-mix(in oklch, ${accent.color} 40%, transparent) 100%)`,
            }}
          />

          <div className="px-5 py-5 space-y-3">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.14em]"
                  style={{ color: accent.color }}
                >
                  Step {stepIdx + 1} of {STEPS.length}
                </span>
                <h3 className="font-serif font-semibold text-[1.05rem] leading-tight text-[var(--ink)]">
                  {step.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={markDone}
                aria-label="Skip tour"
                className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-lg transition-colors mt-0.5"
                style={{ color: "var(--ink-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "color-mix(in oklch, var(--ink) 8%, transparent)";
                  e.currentTarget.style.color = "var(--ink)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--ink-muted)";
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>

            <p className="font-serif text-sm leading-relaxed text-[var(--ink-muted)]">
              {step.body}
            </p>

            {/* Progress bar */}
            <div
              className="h-[2px] rounded-full overflow-hidden"
              style={{ background: "var(--edge)" }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full transition-all duration-400"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, var(--ink-violet), var(--ink-blue))`,
                }}
              />
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirst}
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors disabled:opacity-30"
                style={{ color: "var(--ink-muted)" }}
                onMouseEnter={(e) => {
                  if (!isFirst) e.currentTarget.style.color = "var(--ink)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--ink-muted)";
                }}
              >
                <ChevronLeft size={11} strokeWidth={2} />
                Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markDone}
                  className="font-mono text-[10px] uppercase tracking-[0.1em] transition-colors"
                  style={{ color: "var(--ink-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--ink)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--ink-muted)";
                  }}
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.1em] transition-all duration-150"
                  style={{
                    background: `linear-gradient(135deg, var(--ink-violet) 0%, var(--ink-blue) 100%)`,
                    color: "oklch(97% 0.003 75)",
                    boxShadow: `0 2px 8px color-mix(in oklch, var(--ink-violet) 28%, transparent), inset 0 1px 0 oklch(100% 0 0 / 0.15)`,
                    border: "1px solid oklch(100% 0 0 / 0.1)",
                  }}
                >
                  {isLast ? "Done" : "Next"}
                  {!isLast && <ChevronRight size={11} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Focus trap sentinel — keep keyboard focus inside the card */}
      <div tabIndex={0} style={{ position: "fixed", opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}
