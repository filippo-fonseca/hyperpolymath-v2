import { GitFork, LogIn } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * §07.7 — THE FRAMEWORK CALLOUT.
 *
 * Sits between the architecture diagram and the Choice section. The
 * whole landing has been describing one specific implementation —
 * this section steps back and declares the implementation is not the
 * artifact. Hyperpolymath is a framework: a set of primitives, a
 * contract between an agent and a personal data layer, and a writing
 * style for how to think about productive life systems. The app is
 * one rendering of that framework.
 *
 * sd register: the anchor statement is a dark card-v2 plate on the
 * near-black canvas — Space Grotesk display headline (the platform /
 * framework emphasis rides the single cyan accent), mono uppercase
 * labels, a ❦ fleuron, hairline spines. Loud through scale, not chrome.
 */
export function FrameworkSection() {
  return (
    <Reveal
      as="section"
      id="framework"
      className="py-16 max-w-[1080px] mx-auto px-6 md:px-10 scroll-mt-20"
    >
      <div className="relative overflow-hidden rounded-[18px] border border-[var(--sd-line)] bg-[var(--sd-dark-box)] text-[var(--sd-ink)] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]">
        <div className="relative px-8 md:px-14 py-10 md:py-14">
          {/* Crest row */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex gap-1.5 opacity-50"
                aria-hidden="true"
              >
                <span className="block w-[5px] h-[5px] rounded-full bg-[var(--sd-ink)]" />
                <span className="block w-[5px] h-[5px] rounded-full bg-[var(--sd-ink)]" />
                <span className="block w-[5px] h-[5px] rounded-full bg-[var(--sd-ink)]" />
              </span>
              <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--sd-ink-faint)]">
                § 07.7  ·  The framework
              </span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--sd-ink-faint)]">
              Fork it, build your own
            </span>
          </div>

          {/* Headline */}
          <h2 className="font-semibold text-center text-[40px] md:text-[56px] leading-[1.05] tracking-[-0.02em] text-[var(--sd-ink)]">
            It&rsquo;s a{" "}
            <em className="italic font-extrabold text-[var(--sd-accent)]">
              platform
            </em>
            , but also a{" "}
            <em className="italic font-extrabold text-[var(--sd-accent)]">
              framework
            </em>
            .
            <br className="hidden md:block" />
            <span className="text-[var(--sd-ink-dull)]">
              {" "}
              Use mine, or build your own.
            </span>
          </h2>

          {/* Fleuron spacer */}
          <div
            className="mt-7 md:mt-9 flex items-center justify-center gap-4"
            aria-hidden="true"
          >
            <span className="h-px w-16 md:w-24 bg-[var(--sd-line)]" />
            <span className="font-mono text-[12px] tracking-[0.3em] text-[var(--sd-ink-faint)]">
              ❦
            </span>
            <span className="h-px w-16 md:w-24 bg-[var(--sd-line)]" />
          </div>

          {/* Two-column manifesto */}
          <div className="mt-9 md:mt-11 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <LogIn
                  size={14}
                  aria-hidden="true"
                  className="text-[var(--sd-ink-faint)]"
                />
                <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--sd-ink-faint)]">
                  Just use it
                </p>
              </div>
              <p className="text-[18px] md:text-[19px] leading-[1.6] text-[var(--sd-ink)]">
                The platform is live. Sign in with Google, connect your
                calendar, and start typing one sentence at a time to JARVIS.
                Everything you see on this page is the actual app &mdash;
                nothing on a roadmap I&rsquo;m promising someday. Open in
                a tab, walk away in a week and it&rsquo;ll still be here.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <GitFork
                  size={14}
                  aria-hidden="true"
                  className="text-[var(--sd-ink-faint)]"
                />
                <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--sd-ink-faint)]">
                  Or build your own
                </p>
              </div>
              <p className="text-[18px] md:text-[19px] leading-[1.6] text-[var(--sd-ink)]">
                Hate my UI, my colour choices, my agent&rsquo;s British
                register, my opinions about Notion vs. Todoist? <em>Good</em>.
                The primitives, the JARVIS JSON contract, the realtime
                pattern, the MCP server schema &mdash; all of it is
                documented. Fork the framework and ship the system that
                fits the shape of <em>your</em> life. I encourage it.
              </p>
            </div>
          </div>

          {/* Pull-statement */}
          <p className="mt-10 md:mt-12 text-center italic text-[20px] md:text-[24px] leading-[1.45] max-w-[760px] mx-auto text-[var(--sd-ink)]">
            &ldquo;If the methodology only works for me, it isn&rsquo;t a
            methodology.&rdquo;
          </p>

          {/* Footer brand spine */}
          <div className="mt-10 md:mt-12 flex items-center justify-between border-t border-[var(--sd-line)] pt-4 md:pt-5">
            <span className="font-mono text-[10px] md:text-[11px] tracking-[0.16em] uppercase text-[var(--sd-ink-faint)]">
              ❦  Open source by commitment
            </span>
            <span className="font-mono text-[10px] md:text-[11px] tracking-[0.16em] uppercase text-[var(--sd-ink-faint)]">
              MIT  ·  Built in public
            </span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
