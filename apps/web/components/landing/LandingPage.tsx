import type { CSSProperties } from "react";
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
    <div
      className="dark relative min-h-screen w-full max-w-[100vw] overflow-x-clip text-[var(--sd-ink)]"
      style={
        {
          // The landing is one continuous dark plate — the hero's near-black
          // world carried down the whole page (UI-CONTRACT §0, seed step 2).
          // We force `.dark` and pin the canvas tokens to the hero's near-black
          // so every body section resolves dark sd tokens and there is no seam
          // between the hero and the body, regardless of the app's system theme.
          background: "#08090d",
          "--sd-accent": "var(--hud-cyan)",
          "--canvas": "#08090d",
          "--sd-app": "#08090d",
        } as CSSProperties
      }
    >
      {/* jul-29 craft pass: a barely-there pastel field over the near-black
          plate (the dark cousin of the app's .craft-backdrop). The forced
          .dark scope resolves the dark tint variants, so this stays moody —
          color as atmosphere, not decoration. Static, painted once. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 700px at 8% -6%, color-mix(in srgb, var(--tint-sky-edge) 11%, transparent), transparent 60%), radial-gradient(900px 650px at 100% 14%, color-mix(in srgb, var(--tint-lavender-edge) 9%, transparent), transparent 55%), radial-gradient(1000px 800px at 45% 110%, color-mix(in srgb, var(--tint-plum-edge) 8%, transparent), transparent 60%)",
        }}
      />

      {/* Cursor-following cyan spotlight — sits at z-index 0 behind all
          content. Real content stacks above via the relative z-10 wrapper
          on header / main / footer. */}
      <CursorSpotlight />

      <div className="relative z-10">
      <LandingHeader />
      <LandingSideNav />
      <main>
        {/* §01 — THESIS (cold open) */}
        <div id="thesis" className="scroll-mt-20 tint-sky">
          <ThesisSection />
        </div>

        <SectionDivider />

        {/* §02 — WHO (bio of the human) */}
        <div id="bio" className="scroll-mt-20 tint-peach">
          <BioSection />
        </div>

        <SectionDivider />

        {/* §03 — MEET KIWI (bio of the agent — orchestrator) */}
        <div id="kiwi" className="scroll-mt-20 tint-sage">
          <MeetKiwiSection />
        </div>

        <SectionDivider />

        {/* §04 — LIVE DEMO (clickable rotating demo) */}
        <div id="demo" className="scroll-mt-20 tint-mint">
          <JarvisDemo />
        </div>

        <SectionDivider />

        {/* §05 — THE PRIMITIVES (structure tree + spec table) */}
        <div id="primitives" className="scroll-mt-20 tint-butter">
          <PrimitivesTable />
        </div>

        {/* §06 gets EXTRA 96px breathing room before AND after (UI-SPEC §2) */}
        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §06 — THE ENGINE (Strict Tool Use JSON contract) */}
        <div id="engine" className="scroll-mt-20 tint-lavender">
          <EngineSection />
        </div>

        <div className="py-12">
          <SectionDivider />
        </div>

        {/* §06.5 — THE MCP SERVER (one-source-of-truth for external LLMs) */}
        <div id="mcp" className="scroll-mt-20 tint-sky">
          <MCPSection />
        </div>

        <SectionDivider />

        {/* §07 — THE SURFACE (LifeOS canvas + desktop app + Polypad) */}
        <div id="surface" className="scroll-mt-20 tint-rose">
          <SurfaceSection />
        </div>

        {/* §07.5 — THE STACK (banner SVG embed; SVG carries its own title) */}
        <div id="stack" className="scroll-mt-20 tint-butter">
          <DiagramBannerSection
            eyebrow="§ 07.5 · THE STACK"
            diagramSrc="/diagrams/stack.svg"
            diagramAlt="Three surfaces — Web app, Desktop app middleman, and Polypad hardware — all feeding the Hyperpolymath backend"
          />
        </div>

        <SectionDivider />

        {/* §07.6 — THE ARCHITECTURE (banner SVG embed; SVG carries its own title) */}
        <div id="architecture" className="scroll-mt-20 tint-lavender">
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
        <div id="choice" className="scroll-mt-20 tint-plum">
          <ChoiceSection />
        </div>

        <SectionDivider />

        {/* §09 — BUILD LOG (live data + graceful degradation) */}
        <div id="buildlog" className="scroll-mt-20 tint-mint">
          <BuildLog />
        </div>
      </main>
      <LandingFooter />
      </div>
    </div>
  );
}
