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
    // jul-29 craft pass: the header floats as a detached glass pill (the
    // Craft.do nav grammar) instead of a full-bleed bordered bar. Same
    // contents, same sticky behavior — only the chrome detaches.
    <header className="sticky top-3 z-10 w-full max-w-[100vw] overflow-x-clip px-4 sm:px-6">
      <div className="mx-auto flex h-12 min-w-0 max-w-[1080px] items-center justify-between gap-3 rounded-full border border-white/10 bg-[color-mix(in_srgb,#0b0d12_66%,transparent)] px-4 shadow-[var(--shadow-float)] backdrop-blur-xl sm:px-5">
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
            className="group inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--ink)] px-3.5 font-serif text-[14px] font-medium tracking-tight text-[var(--canvas)] shadow-[var(--shadow-card)] transition-[background-color,transform,box-shadow] duration-150 ease-out hover:bg-[color-mix(in_oklch,var(--ink)_88%,var(--ink-muted))] hover:shadow-[var(--shadow-card-hover)] active:translate-y-px sm:px-4"
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
