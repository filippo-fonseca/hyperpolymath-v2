import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { Logotype } from "@/components/ui/Logotype";

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
    <header className="sticky top-0 z-10 h-14 w-full max-w-[100vw] overflow-x-clip border-b border-[var(--edge)] bg-[color:var(--canvas)]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full min-w-0 max-w-[1200px] items-center justify-between gap-3 px-5 sm:px-6 md:px-10">
        <Link
          href="/"
          className="group inline-flex min-w-0 items-center gap-2 text-[var(--ink)] sm:gap-2.5"
          aria-label="Hyperpolymath · home"
        >
          <KiwiIcon size={18} aria-hidden="true" className="shrink-0" />
          <Logotype className="truncate text-[16px] leading-none sm:text-[17px]" />
          <span className="ml-1 hidden border-l border-[var(--edge)] pl-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)] md:inline">
            MANIFESTO
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
          <span className="hidden md:inline font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            EST. 2026 / MIT
          </span>
          <ThemeToggle variant="header" />
          <Link
            href="/sign-in"
            className="group inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--ink)] px-3 font-serif text-[14px] font-medium tracking-tight text-[var(--canvas)] shadow-[0_1px_0_color-mix(in_oklch,var(--ink)_22%,transparent),0_4px_12px_color-mix(in_oklch,var(--ink)_18%,transparent)] transition-[background-color,transform] duration-150 ease-out hover:bg-[color-mix(in_oklch,var(--ink)_88%,var(--ink-muted))] active:translate-y-px sm:px-4"
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
