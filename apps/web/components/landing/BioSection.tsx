import Image from "next/image";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * §05 — Bio (LAND-BIO).
 *
 * Personal frame for the project: who built it and why. Sits between the
 * Engine (the tech) and the Choice (the ask), so the reader knows whose
 * methodology they're being asked to use or fork.
 *
 * Voice discipline:
 *   - Same 4 canonical sizes {14, 18, 32, 56}; no exceptions
 *   - 720px container like every other section
 *   - No cyan (cyan stays reserved for §02 + §04 per UI-SPEC §4)
 *   - Photo uses rounded-2xl, not rounded-full — softer-square reads more
 *     "frontispiece portrait" than "social-app avatar"
 *   - Photo + prose: side-by-side on md+, stacked on mobile
 *
 * Photo: apps/web/public/filippo.png — Next/Image serves it from /filippo.png.
 *
 * Phase 8 Plan 08-06 gap closure — user feedback at the human-verify
 * checkpoint asked for a "who built this and why" section.
 */
export function BioSection() {
  return (
    <section className="py-16 max-w-[720px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 05 · WHO" />
      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        Why I built this.
      </h2>

      <div className="mt-8 flex flex-col md:flex-row md:items-start md:gap-8">
        {/* Portrait — softer-square, frontispiece style */}
        <div className="flex-shrink-0 mx-auto md:mx-0">
          <Image
            src="/filippo.png"
            alt="Filippo Fonseca"
            width={180}
            height={180}
            className="rounded-2xl border border-[var(--edge)]"
            priority={false}
          />
          <p className="mt-3 font-mono text-[14px] text-[var(--ink-muted)] text-center md:text-left">
            Filippo Fonseca
          </p>
        </div>

        {/* Prose */}
        <div className="mt-8 md:mt-0 space-y-4">
          <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            Student, runner, builder, scholar &mdash; refusing to pick one.
            I&rsquo;ve spent the last decade collecting the kind of skills
            that don&rsquo;t belong on the same résumé: distance running,
            classical reading, software, a few instruments, the long
            slog of trying to understand things from first principles.
          </p>

          <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            The pursuit of polymathy isn&rsquo;t a hobby for me; it&rsquo;s a
            stance. I think the Renaissance ideal &mdash; that the same mind
            can run intervals, read Augustine, and ship code &mdash; is a
            working hypothesis, not nostalgia. It just needs the surrounding
            system to stop forcing you to specialize.
          </p>

          <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            Every productivity app I tried did the opposite. Ten objects when
            I needed five. Fragmented attention when I needed to consolidate.
            Lifelong learning treated as a checklist instead of a way of
            being. So I started engineering the system I wanted to exist:
            small primitives, a single agent, a schema you can fork. The
            whole point is to reduce friction so the brain can do what
            brains do.
          </p>

          <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            Hyperpolymath is the framework that came out of that. It&rsquo;s
            open-source because if the methodology only works for me, it
            isn&rsquo;t a methodology &mdash; it&rsquo;s a diary.
          </p>
        </div>
      </div>
    </section>
  );
}
