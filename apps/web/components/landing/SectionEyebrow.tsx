/**
 * Reusable section eyebrow — "§ 02 · DEMO", "§ 06 · BUILD LOG", etc.
 *
 * sd register (DESIGN-SYSTEM §3): mono micro-label, 11px uppercase, wide
 * tracking, ink-faint. Mono is the eyebrow/caption face on the sd surfaces.
 *
 * jul-29 craft pass: a small leading dot picks up the section's tint when a
 * `tint-*` class is set on any ancestor (the landing tints each § wrapper);
 * elsewhere it falls back to the faint ink and reads as a quiet bullet.
 */
export function SectionEyebrow({ label }: { label: string }) {
  return (
    <p className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--sd-ink-faint)]">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-[var(--tint-edge,var(--sd-ink-faint))]"
      />
      {label}
    </p>
  );
}
