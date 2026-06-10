import { GitFork, LogIn } from "lucide-react";

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
 * Visual register echoes the README banner: cream-paper neumorphic
 * card, EB Garamond title, italic emphasis, mono uppercase labels,
 * fleuron ornament. Loud on purpose — this is the philosophical
 * statement that anchors the rest of the site.
 */
export function FrameworkSection() {
  return (
    <section
      id="framework"
      className="py-16 max-w-[1080px] mx-auto px-6 md:px-10 scroll-mt-20"
    >
      <div
        className="relative overflow-hidden rounded-[22px]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklch, #f7f3ea 96%, transparent), color-mix(in oklch, #efe9db 96%, transparent))",
          boxShadow:
            "0 1px 0 color-mix(in oklch, white 76%, transparent) inset, 0 32px 70px -38px color-mix(in oklch, black 40%, transparent), 0 10px 22px -16px color-mix(in oklch, black 24%, transparent)",
          color: "var(--ink)",
        }}
      >
        <div
          className="absolute inset-[0.5px] rounded-[21.5px] pointer-events-none"
          style={{
            border:
              "1px solid color-mix(in oklch, #1a1a1a 10%, transparent)",
          }}
        />

        <div className="relative px-8 md:px-14 py-10 md:py-14">
          {/* Crest row */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex gap-1.5 opacity-50"
                aria-hidden="true"
              >
                <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
                <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
                <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
              </span>
              <span className="font-mono text-[11px] tracking-[0.22em] uppercase opacity-60">
                § 07.7  ·  The framework
              </span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.22em] uppercase opacity-60">
              Fork it, build your own
            </span>
          </div>

          {/* Headline */}
          <h2 className="font-serif font-semibold text-center text-[40px] md:text-[56px] leading-[1.05] tracking-[-0.015em]">
            It&rsquo;s a{" "}
            <em className="italic font-extrabold">platform</em>.{" "}
            And a{" "}
            <em className="italic font-extrabold">framework</em>.
            <br className="hidden md:block" />
            <span className="opacity-90"> Use mine. Or build your own.</span>
          </h2>

          {/* Fleuron spacer */}
          <div
            className="mt-7 md:mt-9 flex items-center justify-center gap-4"
            aria-hidden="true"
          >
            <span className="h-px w-16 md:w-24 bg-[var(--ink)] opacity-15" />
            <span className="font-mono text-[12px] tracking-[0.3em] opacity-45">
              ❦
            </span>
            <span className="h-px w-16 md:w-24 bg-[var(--ink)] opacity-15" />
          </div>

          {/* Two-column manifesto */}
          <div className="mt-9 md:mt-11 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <LogIn size={14} aria-hidden="true" className="opacity-70" />
                <p className="font-mono text-[11px] tracking-[0.22em] uppercase opacity-65">
                  Just use it
                </p>
              </div>
              <p className="font-serif text-[18px] md:text-[19px] leading-[1.6]">
                The platform is live. Sign in with Google, connect your
                calendar, and start typing one sentence at a time to JARVIS.
                Everything you see on this page is the actual app &mdash;
                nothing on a roadmap I&rsquo;m promising someday. Open in
                a tab, walk away in a week and it&rsquo;ll still be here.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <GitFork size={14} aria-hidden="true" className="opacity-70" />
                <p className="font-mono text-[11px] tracking-[0.22em] uppercase opacity-65">
                  Or build your own
                </p>
              </div>
              <p className="font-serif text-[18px] md:text-[19px] leading-[1.6]">
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
          <p className="mt-10 md:mt-12 text-center font-serif italic text-[20px] md:text-[24px] leading-[1.45] max-w-[760px] mx-auto opacity-85">
            &ldquo;If the methodology only works for me, it isn&rsquo;t a
            methodology.&rdquo;
          </p>

          {/* Footer brand spine */}
          <div className="mt-10 md:mt-12 flex items-center justify-between border-t border-[var(--ink)]/10 pt-4 md:pt-5">
            <span className="font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase opacity-55">
              ❦  Open source by commitment
            </span>
            <span className="font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase opacity-55">
              MIT  ·  Built in public
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
