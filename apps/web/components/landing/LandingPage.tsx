import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { SectionDivider } from "./SectionDivider";
import { ThesisSection } from "./ThesisSection";
import { PrimitivesTable } from "./PrimitivesTable";
import { JarvisDemo } from "./JarvisDemo";
import { EngineSection } from "./EngineSection";

// Plan 08-05 ships the final 2 components (ChoiceSection + BuildLog):
// import { ChoiceSection } from "./ChoiceSection"; // Plan 08-05
// import { BuildLog } from "./BuildLog";           // Plan 08-05

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
 * Wave 3 (Plan 08-04) replaces the §02 and §04 placeholders.
 * Wave 4 (Plan 08-05) replaces the §05 and §06 placeholders.
 *
 * Phase 8 Plan 08-03 — LAND-SHELL (the chrome).
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

        {/* §05 — THE CHOICE — Plan 08-05 replaces this placeholder */}
        <section className="py-16 max-w-[640px] mx-auto px-6 md:px-10">
          <p className="font-mono text-[14px] text-[var(--ink-muted)]">
            [§05 ChoiceSection placeholder — replaced in Plan 08-05]
          </p>
        </section>

        <SectionDivider />

        {/* §06 — BUILD LOG — Plan 08-05 replaces this placeholder */}
        <section className="py-16 max-w-[640px] mx-auto px-6 md:px-10">
          <p className="font-mono text-[14px] text-[var(--ink-muted)]">
            [§06 BuildLog placeholder — replaced in Plan 08-05]
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
