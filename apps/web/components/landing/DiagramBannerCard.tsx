/**
 * DiagramBannerSection — embeds a self-contained banner SVG (stack /
 * architecture) on the landing page.
 *
 * The SVG already carries its own crest row, title, subtitle, hairline,
 * and footer spine, so wrapping it in another React card with the same
 * chrome duplicates everything. This component only adds a small mono
 * section eyebrow above the image to anchor it in page flow, then a
 * soft neumorphic shadow around the SVG so it lifts off the canvas.
 */

interface Props {
  id?: string;
  eyebrow: string;
  diagramSrc: string;
  diagramAlt: string;
}

export function DiagramBannerSection({
  id,
  eyebrow,
  diagramSrc,
  diagramAlt,
}: Props) {
  return (
    <section
      id={id}
      className="py-12 max-w-[1080px] mx-auto px-6 md:px-10"
    >
      <p className="font-mono text-[12px] tracking-[0.22em] uppercase text-[var(--ink-muted)] mb-5 text-center">
        {eyebrow}
      </p>
      <div
        className="rounded-[20px] overflow-hidden"
        style={{
          boxShadow:
            "0 24px 60px -32px color-mix(in oklch, black 38%, transparent), 0 8px 18px -12px color-mix(in oklch, black 22%, transparent)",
        }}
      >
        <img
          src={diagramSrc}
          alt={diagramAlt}
          className="block w-full h-auto"
          loading="lazy"
          decoding="async"
        />
      </div>
    </section>
  );
}
