/**
 * Reusable section eyebrow — "§ 02 · DEMO", "§ 06 · BUILD LOG", etc.
 *
 * Per UI-SPEC §3 role spec table "Mono eyebrow" row:
 *   Caption 14 mono 500 uppercase tracking-[0.14em] --ink-muted.
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
 */
export function SectionEyebrow({ label }: { label: string }) {
  return (
    <p className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
      {label}
    </p>
  );
}
