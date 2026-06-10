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
      <main>
        {/* §01 — THESIS (cold open) */}
        <ThesisSection />

        <SectionDivider />

        {/* §02 — WHO (bio of the human) */}
        <BioSection />

        <SectionDivider />

        {/* §03 — MEET KIWI (bio of the agent — orchestrator) */}
        <MeetKiwiSection />

        <SectionDivider />

        {/* §04 — LIVE DEMO (clickable rotating demo) */}
        <JarvisDemo />

        <SectionDivider />

        {/* §05 — THE PRIMITIVES (structure tree + spec table) */}
        <PrimitivesTable />

        {/* §06 gets EXTRA 96px breathing room before AND after (UI-SPEC §2) */}
        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §06 — THE ENGINE (Strict Tool Use JSON contract) */}
        <EngineSection />

        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §07 — THE SURFACE (LifeOS canvas + desktop app + Polypad) */}
        <SurfaceSection />

        {/* §07.5 — THE STACK (banner-style diagram embed) */}
        <DiagramBannerSection
          eyebrow="§ 07.5 · THE STACK"
          bannerEyebrowRight="FIG. 01  ·  THREE PILLARS"
          title="Three surfaces. One agent."
          subtitle="Type, click, or speak. Every sentence lands in the same backend."
          diagramSrc="/diagrams/stack.svg"
          diagramAlt="Three surfaces — Web app, Desktop app middleman, and Polypad hardware — all feeding the Hyperpolymath backend"
          footerLeft="HYPERPOLYMATH STACK · FIG. 01"
          footerRight="WEB · DESKTOP · POLYPAD"
        />

        <SectionDivider />

        {/* §07.6 — THE ARCHITECTURE (banner-style diagram embed) */}
        <DiagramBannerSection
          eyebrow="§ 07.6 · THE ARCHITECTURE"
          bannerEyebrowRight="FIG. 02  ·  ONE SENTENCE, END TO END"
          title="How a sentence becomes an action:"
          subtitle="The contract every JARVIS turn follows, from typed input to live data."
          diagramSrc="/diagrams/architecture.svg"
          diagramAlt="Request lifecycle — Sentence to Next.js to JARVIS to Executor to Postgres / GCal, with Supabase Realtime looping back to invalidate TanStack Query"
          footerLeft="HYPERPOLYMATH ARCHITECTURE · FIG. 02"
          footerRight="STREAMING · STRICT TOOL USE · REALTIME"
        />

        <SectionDivider />

        {/* §08 — THE CHOICE (two doors) */}
        <ChoiceSection />

        <SectionDivider />

        {/* §09 — BUILD LOG (live data + graceful degradation) */}
        <BuildLog />
      </main>
      <LandingFooter />
      </div>
    </div>
  );
}
