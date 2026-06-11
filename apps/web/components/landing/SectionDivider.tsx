import { KiwiIcon } from "@/components/shared/KiwiIcon";

/**
 * Section divider — three small kiwi glyphs, evenly spaced and centered.
 *
 * Was originally three fleur-de-lis (⚜) glyphs per UI-SPEC §5; switched
 * to the kiwi mark so the divider ornament matches the project's actual
 * mascot rather than a generic Renaissance icon. Visual rhythm and
 * spacing stay the same; just the glyph changes.
 */
export function SectionDivider() {
  return (
    <div
      className="flex items-center justify-center gap-[4em] text-[var(--ink-muted)] select-none"
      aria-hidden="true"
    >
      <KiwiIcon size={14} />
      <KiwiIcon size={14} />
      <KiwiIcon size={14} />
    </div>
  );
}
