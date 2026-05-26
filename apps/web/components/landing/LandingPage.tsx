import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { SectionDivider } from "./SectionDivider";
import { ThesisSection } from "./ThesisSection";
import { PrimitivesTable } from "./PrimitivesTable";
import { JarvisDemo } from "./JarvisDemo";
import { EngineSection } from "./EngineSection";
import { BioSection } from "./BioSection";
import { ChoiceSection } from "./ChoiceSection";
import { BuildLog } from "./BuildLog";

/**
 * Public landing manifesto — Phase 8.
 *
 * Order (user re-pinned bio under hero in 08-06 gap closure):
 *   §01 THESIS → §02 WHO → §03 LIVE JARVIS DEMO → §04 THE PRIMITIVES
 *   → §05 THE ENGINE → §06 THE CHOICE → §07 BUILD LOG
 *
 * Each section is separated by a SectionDivider (⚜ ⚜ ⚜ ornament row).
 * The Engine still gets the 96px breathing room before and after per
 * UI-SPEC §2 (it's the moderate-density section).
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <LandingHeader />
      <main>
        {/* §01 — THESIS (no eyebrow, cold open — hero with live JARVIS line) */}
        <ThesisSection />

        <SectionDivider />

        {/* §02 — WHO (bio sits right under the hero per user feedback) */}
        <BioSection />

        <SectionDivider />

        {/* §03 — LIVE JARVIS DEMO (the full clickable demo) */}
        <JarvisDemo />

        <SectionDivider />

        {/* §04 — THE PRIMITIVES (structure tree + spec table) */}
        <PrimitivesTable />

        {/* §05 gets EXTRA 96px breathing room before AND after (UI-SPEC §2) */}
        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §05 — THE ENGINE (Strict Tool Use JSON contract) */}
        <EngineSection />

        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §06 — THE CHOICE (two doors — waitlist + fork) */}
        <ChoiceSection />

        <SectionDivider />

        {/* §07 — BUILD LOG (hybrid live data + graceful degradation) */}
        <BuildLog />
      </main>
      <LandingFooter />
    </div>
  );
}
