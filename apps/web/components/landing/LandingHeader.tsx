import { ThemeToggle } from "@/components/shell/ThemeToggle";

/**
 * Landing header — sticky, mono eyebrow + theme toggle on the right.
 *
 * Per UI-SPEC §8a the canonical content is:
 *   "HYPERPOLYMATH · MANIFESTO" left · "EST. 2026 / MIT" right
 *
 * The theme toggle sits at the far right of the right group so the
 * "EST. 2026 / MIT" caption stays close to the centerline of the eyebrow
 * register. Header grows to h-12 from h-10 to give the 36px toggle button
 * a 6px vertical breathing margin instead of pinching against the hairline.
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-10 h-12 bg-[color:var(--canvas)]/95 backdrop-blur-sm border-b border-[var(--edge)]">
      <div className="h-full max-w-[1200px] mx-auto px-6 md:px-10 flex items-center justify-between">
        <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          HYPERPOLYMATH · MANIFESTO
        </span>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            EST. 2026 / MIT
          </span>
          <ThemeToggle variant="header" />
        </div>
      </div>
    </header>
  );
}
