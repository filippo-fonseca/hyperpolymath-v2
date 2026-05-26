import { ArrowUpRight } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * §03 — The Primitives spec table.
 *
 * Per UI-SPEC §5c:
 *   - Mono eyebrow "§ 03 · THE PRIMITIVES"
 *   - Display 2 heading "Five primitives. One agent."
 *   - One sentence body
 *   - 24px gap, then 3-column hairline-only spec table:
 *       PRIMITIVE (Mono Caption 14 500 tracking-[0.04em] --ink)
 *       ROLE      (Serif Body 18 400 --ink)
 *       SPEC      (Lucide ArrowUpRight 16px --ink-muted wrapped in <a>)
 *   - 56px row min-height
 *   - 1px --edge between rows (no outer box border on desktop; no zebra)
 *
 * Each SPEC link follows D-08:
 *   https://github.com/filippo-fonseca/hyperpolymath-v2/blob/main/FRAMEWORK.md#{anchor}
 *
 * Anchors match the H2 text in FRAMEWORK.md (verified — Plan 08-01 commit 468730d):
 *   ## Areas    → #areas
 *   ## Projects → #projects
 *   ## Captures → #captures
 *   ## JARVIS   → #jarvis
 *   ## Calendar → #calendar
 *
 * Copy strings verbatim from UI-SPEC §9.
 *
 * Phase 8 Plan 08-03 — LAND-PRIMITIVES (SC-4 / D-06 / D-08).
 */

const GITHUB_FRAMEWORK_BASE =
  "https://github.com/filippo-fonseca/hyperpolymath-v2/blob/main/FRAMEWORK.md";

const PRIMITIVES = [
  {
    name: "Areas",
    role: "Top-level life domains (Health, School, ...)",
    anchor: "areas",
  },
  {
    name: "Projects",
    role: "Bounded efforts inside Areas (incl. Classes)",
    anchor: "projects",
  },
  {
    name: "Captures",
    role: "Frictionless inbox for fleeting thoughts",
    anchor: "captures",
  },
  {
    name: "JARVIS",
    role: "Natural-language agent · strict tool use",
    anchor: "jarvis",
  },
  {
    name: "Calendar",
    role: "Google Calendar as source of truth",
    anchor: "calendar",
  },
] as const;

export function PrimitivesTable() {
  return (
    <section className="py-16 max-w-[800px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 03 · THE PRIMITIVES" />

      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        Five primitives. One agent.
      </h2>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Most productivity apps give you ten kinds of object and call that
        flexibility. To me it&rsquo;s closer to a furniture store. What I
        actually wanted was the opposite: the smallest set of primitives that
        could still cover the whole surface area of a life without forcing
        me to specialize.
      </p>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Five turned out to be the number. Three modes of intent (areas,
        projects, captures), one source of time (the calendar), and one
        router that ties them all together (the agent I call JARVIS).
        Anything more is decoration. Anything less and you&rsquo;re back in
        the trap. Use mine, or fork the framework. Either way, this is the
        contract.
      </p>

      <div className="mt-6">
        {/* Column header row */}
        <div className="grid grid-cols-[140px_1fr_60px] items-center border-b border-[var(--edge)] pb-3">
          <span className="font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-[var(--ink-muted)]">
            PRIMITIVE
          </span>
          <span className="font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-[var(--ink-muted)]">
            ROLE
          </span>
          <span className="font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-[var(--ink-muted)] text-right hidden md:inline">
            SPEC
          </span>
        </div>

        {/* Primitive rows */}
        {PRIMITIVES.map((p) => (
          <div
            key={p.anchor}
            className="grid grid-cols-[140px_1fr_60px] items-center min-h-[56px] border-b border-[var(--edge)]"
          >
            <span className="font-mono text-[14px] font-medium tracking-[0.04em] text-[var(--ink)]">
              {p.name}
            </span>
            <span className="font-serif text-[18px] leading-[1.4] text-[var(--ink)]">
              {p.role}
            </span>
            <a
              href={`${GITHUB_FRAMEWORK_BASE}#${p.anchor}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read the ${p.name} spec in FRAMEWORK.md on GitHub`}
              className="justify-self-end text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            >
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
