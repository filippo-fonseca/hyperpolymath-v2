/**
 * Section divider — three ⚜ glyphs separated by 4em of space, centered.
 *
 * Per UI-SPEC §5:
 *   "A single horizontal row, centered, of three ⚜ glyphs separated by 4em of
 *   space, in --ink-muted at Body 18px. Sits halfway in the 96px / 128px
 *   inter-section gap. No <hr> lines. The ornament IS the divider."
 *
 * Body 18 (one of the 4 canonical sizes — UI-SPEC §3).
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
 */
export function SectionDivider() {
  return (
    <div
      className="text-[18px] text-[var(--ink-muted)] text-center select-none"
      aria-hidden="true"
    >
      <span
        style={{
          letterSpacing: "4em",
          display: "inline-block",
          paddingLeft: "4em",
        }}
      >
        ⚜⚜⚜
      </span>
    </div>
  );
}
