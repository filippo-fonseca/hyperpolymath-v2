import { BookOpen, Github } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { WaitlistForm } from "./WaitlistForm";

/**
 * §05 — The Choice (LAND-CHOICE / SC-7 / D-12 / D-13 / UI-SPEC §5e).
 *
 * Two equally-weighted doors per UI-SPEC §5e equal-weight discipline:
 *   - Door 1 USE IT: waitlist form (WaitlistForm component handles state)
 *   - Door 2 FORK IT: 2 secondary text-links (BookOpen FRAMEWORK.md + Github repo) + caption
 *
 * Equal visual weight at 1440px viewport — Door 1 has more chrome (form), Door 2
 * has more content density (2 links + caption). UI-SPEC §5e: no "primary"/"secondary"
 * distinction; both are siblings.
 */

const REPO_URL = "https://github.com/filippo-fonseca/hyperpolymath-v2";
const FRAMEWORK_URL = `${REPO_URL}/blob/main/FRAMEWORK.md`;

export function ChoiceSection() {
  return (
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 06 · THE CHOICE" />
      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        Two doors. Both open.
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        The framework is the artifact; the app is just one implementation of
        it. Use mine if it fits the shape of your life, or take the contract
        and build the one that does. I made all of this open-source on
        purpose. If the methodology only works for me, it isn&rsquo;t a
        methodology.
      </p>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Door 1 — USE IT (waitlist) */}
        <div className="space-y-4">
          <SectionEyebrow label="USE IT" />
          <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            v2 is single-user while I&rsquo;m building it in public. Multi-user comes once the foundation is bulletproof.
          </p>
          <WaitlistForm />
        </div>

        {/* Door 2 — FORK IT */}
        <div className="space-y-4">
          <SectionEyebrow label="FORK IT" />
          <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
            Read the framework, clone the repo, and adapt the primitives to your own life-OS. It&rsquo;s MIT-licensed. Go.
          </p>
          <div className="space-y-2">
            <a
              href={FRAMEWORK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>▶ Read the framework</span>
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            >
              <Github size={16} aria-hidden="true" />
              <span>◆ View the repo</span>
            </a>
          </div>
          <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
            MIT licensed. Built in public. No dependencies on me.
          </p>
        </div>
      </div>
    </section>
  );
}
