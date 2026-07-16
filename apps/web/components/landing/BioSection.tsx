import Image from "next/image";
import { Linkedin, Github, Globe } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { Reveal } from "./Reveal";

/**
 * §05 — Bio (LAND-BIO).
 *
 * Personal frame for the project: who built it and why. Sits between the
 * Engine (the tech) and the Choice (the ask), so the reader knows whose
 * methodology they're being asked to use or fork.
 *
 * Voice + visual discipline (Phase 8 Plan 08-06 gap closure):
 *   - 4 canonical sizes {14, 18, 32, 56}; no exceptions
 *   - 800px container (matches the widened landing-wide unify)
 *   - Photo uses rounded-2xl, not rounded-full — softer-square reads more
 *     "frontispiece portrait" than "social-app avatar"
 *   - Social link icons hover to --hud-cyan (JARVIS signature now reads as
 *     ambient — gate UI-SPEC §11a relaxed per checkpoint feedback)
 *   - The mention of "a startup" links to https://zyndicate.app in a new tab
 *
 * Photo: apps/web/public/filippo.png — Next/Image serves it from /filippo.png.
 */

const SOCIAL_LINKS = [
  {
    label: "LinkedIn",
    href: "https://linkedin.com/in/filippo-fonseca",
    Icon: Linkedin,
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/FilippoFonseca",
    Icon: XIcon,
  },
  {
    label: "GitHub",
    href: "https://github.com/filippo-fonseca",
    Icon: Github,
  },
  {
    label: "filippofonseca.com",
    href: "https://filippofonseca.com",
    Icon: Globe,
  },
] as const;

export function BioSection() {
  return (
    <section
      id="why"
      className="py-16 max-w-[920px] mx-auto px-6 md:px-10 scroll-mt-20"
    >
      <Reveal>
        <SectionEyebrow label="§ 02 · WHO" />
        <h2 className="mt-2 font-semibold text-[32px] leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
          Why I built this.
        </h2>
      </Reveal>

      {/* Identity card — portrait + name + credentials + social row.
          Sits at the top; the prose flows below at full width. */}
      <Reveal i={1} className="mt-8 flex flex-col md:flex-row md:items-start md:gap-8">
        <div className="flex-shrink-0 mx-auto md:mx-0">
          <Image
            src="/filippo.png"
            alt="Filippo Fonseca"
            width={180}
            height={180}
            className="rounded-[14px] border border-[var(--sd-line)]"
            priority={false}
          />
        </div>

        <div className="mt-6 md:mt-0 flex-1 text-center md:text-left">
          <p className="text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
            Filippo Fonseca
          </p>
          <p className="mt-2 text-[14px] leading-[1.55] text-[var(--sd-ink-dull)]">
            Yale MechE (ABET) + EECS &rsquo;28 · Engineer @ Mass General /
            Harvard Med · President @ Yale Robotics · Entrepreneur ·
            Biomechatronics · Polyglot · Stoic
          </p>
          <p className="mt-2 italic text-[14px] leading-[1.5] text-[var(--sd-ink-dull)]">
            I build humanist physical intelligence w/ robotics &amp;
            materials. 🫀🦴
          </p>
          <p className="mt-2 font-mono text-[12px] text-[var(--sd-ink-faint)] tracking-[0.06em]">
            New Haven, Connecticut
          </p>

          {/* Social links — sd icon-buttons. Hover lifts ink to the cyan accent. */}
          <ul className="mt-4 flex justify-center md:justify-start gap-2">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--sd-ink-faint)] transition-colors duration-150 hover:text-[var(--sd-accent)]"
                >
                  <Icon size={15} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* Prose flows below the identity card at full container width.
          Inner max-w cap keeps the measure readable. */}
      <Reveal i={2} as="div" className="mt-10 max-w-[720px] mx-auto md:mx-0 space-y-4">
          <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
            I&rsquo;m a student, a runner, a long-time builder, and someone who
            has spent most of the last decade collecting skills that don&rsquo;t
            really belong on the same résumé. Distance running, classical
            reading, software since I was a kid, a few instruments I&rsquo;m bad
            at, and the slow work of trying to understand things from first
            principles. The Renaissance ideal has never felt like nostalgia to
            me. It&rsquo;s felt like a working hypothesis: the same person who
            trains for a marathon can read Augustine and ship code. The world
            just needs a system around them that stops asking them to choose.
          </p>

          <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
            I tried to build that system once before. Six years ago I started{" "}
            <a
              href="https://zyndicate.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--sd-ink-faint)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--sd-accent)] hover:decoration-[var(--sd-accent)]"
            >
              a productivity startup
            </a>{" "}
            with a strikingly similar thesis, that the way our digital tools
            fragment our attention is the actual obstacle to lifelong learning,
            not the time we don&rsquo;t have. I wrote a long manifesto about
            it, full of principles like &ldquo;visualize,&rdquo;
            &ldquo;relate,&rdquo; &ldquo;ideate,&rdquo; and &ldquo;learn.&rdquo;
            The startup failed for all the usual reasons (and the fact I was 14
            and didn&rsquo;t know what I was doing; I still don&rsquo;t most of
            the time, but I like to think I&rsquo;ve come a long way!). But the
            problem never went away. If anything, the years since have only
            made me more convinced that disorganization in our digital lives is
            the unsolved version of the disorganization we&rsquo;d never
            tolerate in our physical ones, and that it matters more now than it
            did then.
          </p>

          <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
            Hyperpolymath is what I want to use, every day. Five primitives
            instead of ten. One agent instead of a dozen integrations. A schema
            you can fork rather than a walled garden you have to live inside.
            The whole point is to lower the friction between having a thought
            and acting on it, so the brain is free to do what brains do: connect
            things, learn, build, and yes, get out of the house and run.
          </p>

          <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
            I wrote extensive docs, so if you don&rsquo;t like my UI or my
            approach, or you fancy a cool build, you can follow my framework
            and make it your own.
          </p>
      </Reveal>
    </section>
  );
}

/**
 * Inline X (Twitter) logo. Lucide doesn't ship the post-rebrand X glyph,
 * so we inline the official mark. Renders at currentColor to inherit
 * the link's hover state.
 */
function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
