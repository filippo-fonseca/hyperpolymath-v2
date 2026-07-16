/**
 * Reusable section eyebrow — "§ 02 · DEMO", "§ 06 · BUILD LOG", etc.
 *
 * sd register (DESIGN-SYSTEM §3): mono micro-label, 11px uppercase, wide
 * tracking, ink-faint. Mono is the eyebrow/caption face on the sd surfaces.
 */
export function SectionEyebrow({ label }: { label: string }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--sd-ink-faint)]">
      {label}
    </p>
  );
}
