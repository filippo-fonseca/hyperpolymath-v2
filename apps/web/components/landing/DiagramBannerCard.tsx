/**
 * DiagramBannerSection — embeds a self-contained banner SVG (stack /
 * architecture) on the landing page.
 *
 * The SVG already carries its own crest row, title, subtitle, hairline,
 * and footer spine, so wrapping it in another React card with the same
 * chrome duplicates everything. This component only adds a small mono
 * section eyebrow above the image, then frames the self-contained diagram
 * in an sd hairline plate so it reads as an intentional printed figure on
 * the dark canvas.
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
      <p className="font-mono text-micro tracking-[0.16em] uppercase text-[var(--sd-ink-faint)] mb-5 text-center">
        {eyebrow}
      </p>
      <div className="rounded-[14px] overflow-hidden border border-[var(--sd-line)]">
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
