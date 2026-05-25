import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { SectionDivider } from "./SectionDivider";
import { ThesisSection } from "./ThesisSection";
import { PrimitivesTable } from "./PrimitivesTable";
import { JarvisDemo } from "./JarvisDemo";
import { EngineSection } from "./EngineSection";
import { ChoiceSection } from "./ChoiceSection";
import { BuildLog } from "./BuildLog";

/**
 * Public landing manifesto — Phase 8 (LAND-SHELL / SC-2).
 *
 * Renders 6 sections in order per UI-SPEC §5:
 *   §01 THESIS → §02 LIVE JARVIS DEMO → §03 THE PRIMITIVES → §04 THE ENGINE
 *   → §05 THE CHOICE → §06 BUILD LOG
 *
 * Each section is separated by a SectionDivider (the ⚜ ⚜ ⚜ ornament row,
 * NOT an <hr>). Inter-section vertical rhythm: 64px (sparse sections —
 * §01/§03/§05/§06) and 96px BEFORE+AFTER §04 (the moderate-density Engine
 * section per UI-SPEC §2).
 *
 * Wave 3 (Plan 08-04) wired the §02 + §04 cyan-bearing surfaces.
 * Wave 4 (Plan 08-05) wired the §05 ChoiceSection + §06 BuildLog.
 *
 * Phase 8 Plans 08-03 (shell) + 08-04 (cyan surfaces) + 08-05 (data-driven §05 / §06).
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <LandingHeader />
      <main>
        {/* §01 — THESIS (no eyebrow, cold open) */}
        <ThesisSection />

        <SectionDivider />

        {/* §02 — LIVE JARVIS DEMO (Plan 08-04 / cyan surface 1 of 2) */}
        <JarvisDemo />

        <SectionDivider />

        {/* §03 — THE PRIMITIVES (spec table) */}
        <PrimitivesTable />

        {/* §04 gets EXTRA 96px breathing room before AND after (UI-SPEC §2) */}
        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §04 — THE ENGINE (Plan 08-04 / cyan surface 2 of 2) */}
        <EngineSection />

        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §05 — THE CHOICE (Plan 08-05 / two doors — waitlist + fork) */}
        <ChoiceSection />

        <SectionDivider />

        {/* §06 — BUILD LOG (Plan 08-05 / hybrid live data + graceful degradation) */}
        <BuildLog />
      </main>
      <LandingFooter />
    </div>
  );
}
