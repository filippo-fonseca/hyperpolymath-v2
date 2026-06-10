import type { ReactNode } from "react";

/**
 * DiagramBannerCard — frames an SVG diagram on the landing in the same
 * visual register as the README hero / stack / architecture banners:
 * cream paper background, neumorphic soft shadow, top crest row with
 * mono meta-label, EB Garamond serif title + italic subtitle, hairline
 * ornament divider, and a small fleuron-marked footer line.
 *
 * Layout matches the SVG banners but lives as a React composition so
 * the typography uses real EB Garamond from next/font instead of the
 * generic-serif fallback the static SVG settles on inside GitHub.
 */

interface Props {
  eyebrowLeft: string;
  eyebrowRight: string;
  title: string;
  subtitle: string;
  diagramSrc: string;
  diagramAlt: string;
  footerLeft: string;
  footerRight: string;
}

export function DiagramBannerCard({
  eyebrowLeft,
  eyebrowRight,
  title,
  subtitle,
  diagramSrc,
  diagramAlt,
  footerLeft,
  footerRight,
}: Props) {
  return (
    <div
      className="relative overflow-hidden rounded-[20px]"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklch, #f7f3ea 96%, transparent), color-mix(in oklch, #efe9db 96%, transparent))",
        boxShadow:
          "0 1px 0 color-mix(in oklch, white 75%, transparent) inset, 0 24px 60px -32px color-mix(in oklch, black 38%, transparent), 0 8px 18px -12px color-mix(in oklch, black 22%, transparent)",
        color: "var(--ink)",
      }}
    >
      <div
        className="absolute inset-[0.5px] rounded-[19.5px] pointer-events-none"
        style={{ border: "1px solid color-mix(in oklch, #1a1a1a 10%, transparent)" }}
      />

      <div className="relative px-8 md:px-12 pt-8 md:pt-10 pb-6 md:pb-8">
        {/* Eyebrow row — mirrors the SVG banner's crest row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex gap-1.5 opacity-50"
              aria-hidden="true"
            >
              <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
              <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
              <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
            </span>
            <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-60">
              {eyebrowLeft}
            </span>
          </div>
          <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-60">
            {eyebrowRight}
          </span>
        </div>

        {/* Title + subtitle, centered like the SVG banners */}
        <h2 className="font-serif font-semibold text-center text-[40px] md:text-[48px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]">
          {title}
        </h2>
        <p className="mt-3 text-center font-serif italic text-[18px] md:text-[20px] leading-[1.5] text-[var(--ink)] opacity-70">
          {subtitle}
        </p>

        {/* Hairline + ornament spacer */}
        <div className="mt-6 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-12 md:w-16 bg-[var(--ink)] opacity-15" />
          <span className="font-mono text-[10px] tracking-[0.3em] opacity-40">❦</span>
          <span className="h-px w-12 md:w-16 bg-[var(--ink)] opacity-15" />
        </div>

        {/* Diagram */}
        <div className="mt-8">
          <img
            src={diagramSrc}
            alt={diagramAlt}
            className="block w-full h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>

        {/* Footer brand spine */}
        <div className="mt-6 flex items-center justify-between border-t border-[var(--ink)]/10 pt-4">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-50">
            ❦  {footerLeft}
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-50">
            {footerRight}
          </span>
        </div>
      </div>
    </div>
  );
}

interface DiagramSectionProps {
  id?: string;
  eyebrow: string;
  bannerEyebrowRight: string;
  title: string;
  subtitle: string;
  intro?: ReactNode;
  diagramSrc: string;
  diagramAlt: string;
  footerLeft: string;
  footerRight: string;
}

export function DiagramBannerSection({
  id,
  eyebrow,
  bannerEyebrowRight,
  title,
  subtitle,
  intro,
  diagramSrc,
  diagramAlt,
  footerLeft,
  footerRight,
}: DiagramSectionProps) {
  return (
    <section
      id={id}
      className="py-16 max-w-[1080px] mx-auto px-6 md:px-10"
    >
      {intro ? (
        <div className="mb-10 max-w-[760px] mx-auto text-center">
          <p className="font-mono text-[12px] tracking-[0.22em] uppercase text-[var(--ink-muted)] mb-3">
            {eyebrow}
          </p>
          <div className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            {intro}
          </div>
        </div>
      ) : null}

      <DiagramBannerCard
        eyebrowLeft={eyebrow}
        eyebrowRight={bannerEyebrowRight}
        title={title}
        subtitle={subtitle}
        diagramSrc={diagramSrc}
        diagramAlt={diagramAlt}
        footerLeft={footerLeft}
        footerRight={footerRight}
      />
    </section>
  );
}
