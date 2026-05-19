interface Props {
  collapsed: boolean;
}

/**
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5e + brand mark notes):
 *
 * EB Garamond serif at 600 — the brand mark sits on diplomatic chrome but
 * carries the document register (it IS the wordmark). Neumorphic shadow
 * tokens retired per UI-SPEC §14a — the underlying surface owns its edge.
 * Letter-spacing stays tight (-0.03em) per Phase 6 baseline.
 */
export function Wordmark({ collapsed }: Props) {
  return (
    <div
      className="font-serif font-semibold text-base text-[var(--ink)] select-none overflow-hidden"
      style={{ letterSpacing: "-0.03em" }}
    >
      {collapsed ? "H" : "Hyperpolymath"}
    </div>
  );
}
