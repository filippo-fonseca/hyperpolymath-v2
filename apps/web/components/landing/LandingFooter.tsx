/**
 * Landing footer — 3-column mono row + centered ornament + italic sign-off.
 *
 * Per UI-SPEC §8b:
 *   3 mono columns:    MIT LICENSE   |   github.com/filippo-fonseca   |   filippofonseca.com →
 *   1 centered ⚜ ornament (24px icon dimensions — exempt from type scale,
 *     --ink-muted opacity 0.4)
 *   1 centered italic Caption 14 serif sign-off (lowercase intentional)
 *   80px vertical padding above/below, 1px --edge top hairline
 *
 * Copy strings verbatim from UI-SPEC §9.
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--edge)] py-20">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
          <a
            href="https://opensource.org/licenses/MIT"
            className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          >
            MIT LICENSE
          </a>
          <a
            href="https://github.com/filippo-fonseca"
            className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors text-center"
          >
            github.com/filippo-fonseca
          </a>
          <a
            href="https://filippofonseca.com"
            className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors md:text-right"
          >
            filippofonseca.com →
          </a>
        </div>

        <div className="text-center">
          <span
            className="text-[24px] text-[var(--ink-muted)] opacity-40 select-none"
            aria-hidden="true"
          >
            ⚜
          </span>
        </div>

        <p className="text-center font-serif italic text-[14px] text-[var(--ink-muted)]">
          how you do one thing is how you do everything. love what you do.
        </p>

        <p className="text-center font-serif text-[14px] text-[var(--ink-muted)]">
          Made with{" "}
          <span
            aria-label="love"
            style={{ color: "var(--hud-cyan)" }}
            className="align-middle"
          >
            ♥
          </span>{" "}
          by{" "}
          <a
            href="https://filippofonseca.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--ink-muted)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--hud-cyan)] hover:decoration-[var(--hud-cyan)]"
          >
            Filippo Fonseca
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
