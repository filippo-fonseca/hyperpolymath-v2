/**
 * Landing header — 40px tall, sticky, mono eyebrow only, 1px --edge bottom hairline.
 *
 * Per UI-SPEC §8a:
 *   "HYPERPOLYMATH · MANIFESTO" left · "EST. 2026 / MIT" right
 *   Caption 14 mono 500 uppercase tracking-[0.14em] --ink-muted
 *   bg-[var(--canvas)]/95 backdrop-blur-sm ONLY (no theatrical frosted glass)
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-10 h-10 bg-[color:var(--canvas)]/95 backdrop-blur-sm border-b border-[var(--edge)]">
      <div className="h-full max-w-[1200px] mx-auto px-6 md:px-10 flex items-center justify-between">
        <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          HYPERPOLYMATH · MANIFESTO
        </span>
        <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          EST. 2026 / MIT
        </span>
      </div>
    </header>
  );
}
