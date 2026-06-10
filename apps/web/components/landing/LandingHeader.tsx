import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

/**
 * Landing header — sticky chrome. The left mono eyebrow now carries the
 * Kiwi glyph so the brand reads at a glance, and the right side terminates
 * in a solid CTA Sign-in pill (ink-on-canvas, hover bumps to surface-raised)
 * rather than a quiet mono link that disappeared into the rest of the row.
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-10 h-14 bg-[color:var(--canvas)]/95 backdrop-blur-sm border-b border-[var(--edge)]">
      <div className="h-full max-w-[1200px] mx-auto px-6 md:px-10 flex items-center justify-between">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-[var(--ink)]"
          aria-label="Hyperpolymath · home"
        >
          <KiwiIcon size={18} aria-hidden="true" className="shrink-0" />
          <span className="font-serif text-[17px] font-semibold tracking-tight leading-none">
            Hyperpolymath
          </span>
          <span className="hidden md:inline font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)] pl-2 border-l border-[var(--edge)] ml-1">
            MANIFESTO
          </span>
        </Link>

        <div className="flex items-center gap-3 md:gap-4">
          <span className="hidden md:inline font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            EST. 2026 / MIT
          </span>
          <ThemeToggle variant="header" />
          <Link
            href="/sign-in"
            className="group inline-flex items-center gap-1.5 h-9 px-4 rounded-md font-serif text-[14px] font-medium tracking-tight text-[var(--canvas)] bg-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink)_88%,var(--ink-muted))] transition-[background-color,transform] duration-150 ease-out active:translate-y-px shadow-[0_1px_0_color-mix(in_oklch,var(--ink)_22%,transparent),0_4px_12px_color-mix(in_oklch,var(--ink)_18%,transparent)]"
          >
            <span>Sign in</span>
            <ArrowUpRight
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
