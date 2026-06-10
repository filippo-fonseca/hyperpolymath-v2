import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { SectionDivider } from "./SectionDivider";
import { ThesisSection } from "./ThesisSection";
import { PrimitivesTable } from "./PrimitivesTable";
import { JarvisDemo } from "./JarvisDemo";
import { EngineSection } from "./EngineSection";
import { SurfaceSection } from "./SurfaceSection";
import { BioSection } from "./BioSection";
import { MeetKiwiSection } from "./MeetKiwiSection";
import { ChoiceSection } from "./ChoiceSection";
import { BuildLog } from "./BuildLog";
import { CursorSpotlight } from "./CursorSpotlight";
import { DiagramBannerSection } from "./DiagramBannerCard";
import { MCPSection } from "./MCPSection";
import { LandingSideNav } from "./LandingSideNav";
import { FrameworkSection } from "./FrameworkSection";

/**
 * Public landing manifesto — Phase 8.
 *
 * Order (MeetKiwi explainer inserted in 08-06 gap closure):
 *   §01 THESIS → §02 WHO → §03 MEET KIWI → §04 LIVE DEMO
 *   → §05 THE PRIMITIVES → §06 THE ENGINE → §07 THE CHOICE → §08 BUILD LOG
 *
 * Section dividers between each. Engine still gets the 96px breathing
 * room before and after per UI-SPEC §2.
 */
export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[var(--canvas)] text-[var(--ink)] overflow-hidden">
      {/* Cursor-following cyan spotlight — sits at z-index 0 behind all
          content. Real content stacks above via the relative z-10 wrapper
          on header / main / footer. */}
      <CursorSpotlight />

      <div className="relative z-10">
      <LandingHeader />
      <LandingSideNav />
      <main>
        {/* §01 — THESIS (cold open) */}
        <div id="thesis" className="scroll-mt-20">
          <ThesisSection />
        </div>

        <SectionDivider />

        {/* §02 — WHO (bio of the human) */}
        <div id="bio" className="scroll-mt-20">
          <BioSection />
        </div>

        <SectionDivider />

        {/* §03 — MEET KIWI (bio of the agent — orchestrator) */}
        <div id="kiwi" className="scroll-mt-20">
          <MeetKiwiSection />
        </div>

        <SectionDivider />

        {/* §04 — LIVE DEMO (clickable rotating demo) */}
        <div id="demo" className="scroll-mt-20">
          <JarvisDemo />
        </div>

        <SectionDivider />

        {/* §05 — THE PRIMITIVES (structure tree + spec table) */}
        <div id="primitives" className="scroll-mt-20">
          <PrimitivesTable />
        </div>

        {/* §06 gets EXTRA 96px breathing room before AND after (UI-SPEC §2) */}
        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §06 — THE ENGINE (Strict Tool Use JSON contract) */}
        <div id="engine" className="scroll-mt-20">
          <EngineSection />
        </div>

        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §06.5 — THE MCP SERVER (one-source-of-truth for external LLMs) */}
        <div id="mcp" className="scroll-mt-20">
          <MCPSection />
        </div>

        <SectionDivider />

        {/* §07 — THE SURFACE (LifeOS canvas + desktop app + Polypad) */}
        <div id="surface" className="scroll-mt-20">
          <SurfaceSection />
        </div>

        {/* §07.5 — THE STACK (banner SVG embed; SVG carries its own title) */}
        <div id="stack" className="scroll-mt-20">
          <DiagramBannerSection
            eyebrow="§ 07.5 · THE STACK"
            diagramSrc="/diagrams/stack.svg"
            diagramAlt="Three surfaces — Web app, Desktop app middleman, and Polypad hardware — all feeding the Hyperpolymath backend"
          />
        </div>

        <SectionDivider />

        {/* §07.6 — THE ARCHITECTURE (banner SVG embed; SVG carries its own title) */}
        <div id="architecture" className="scroll-mt-20">
          <DiagramBannerSection
            eyebrow="§ 07.6 · THE ARCHITECTURE"
            diagramSrc="/diagrams/architecture.svg"
            diagramAlt="Request lifecycle — Sentence to Next.js to JARVIS to Executor to Postgres / GCal, with Supabase Realtime looping back to invalidate TanStack Query"
          />
        </div>

        <SectionDivider />

        {/* §07.7 — THE FRAMEWORK (platform + framework dual-message banner) */}
        <FrameworkSection />

        <SectionDivider />

        {/* §08 — THE CHOICE (two doors) */}
        <div id="choice" className="scroll-mt-20">
          <ChoiceSection />
        </div>

        <SectionDivider />

        {/* §09 — BUILD LOG (live data + graceful degradation) */}
        <div id="buildlog" className="scroll-mt-20">
          <BuildLog />
        </div>
      </main>
      <LandingFooter />
      </div>
    </div>
  );
}
