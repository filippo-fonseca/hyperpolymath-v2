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
 * Renders 7 sections in order (BioSection added in 08-06 gap closure):
 *   §01 THESIS → §02 LIVE JARVIS DEMO → §03 THE PRIMITIVES → §04 THE ENGINE
 *   → §05 WHO → §06 THE CHOICE → §07 BUILD LOG
 *
 * Each section is separated by a SectionDivider (the ⚜ ⚜ ⚜ ornament row).
 * §04 keeps the 96px breathing room before and after per UI-SPEC §2.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <LandingHeader />
      <main>
        {/* §01 — THESIS (no eyebrow, cold open) */}
        <ThesisSection />

        <SectionDivider />

        {/* §02 — LIVE JARVIS DEMO (cyan surface 1 of 2) */}
        <JarvisDemo />

        <SectionDivider />

        {/* §03 — THE PRIMITIVES (spec table) */}
        <PrimitivesTable />

        {/* §04 gets EXTRA 96px breathing room before AND after (UI-SPEC §2) */}
        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §04 — THE ENGINE (cyan surface 2 of 2) */}
        <EngineSection />

        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §05 — WHO (bio + methodology — added in 08-06 gap closure) */}
        <BioSection />

        <SectionDivider />

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
