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

type Primitive = {
  name: string;
  role: string;
  anchor: string | null;
};

const PRIMITIVES: ReadonlyArray<Primitive> = [
  {
    name: "Areas",
    role: "Top-level life domains (Health, School, Work, …)",
    anchor: "areas",
  },
  {
    name: "Projects",
    role: "Bounded efforts inside an Area (incl. Classes)",
    anchor: "projects",
  },
  {
    name: "Building Blocks",
    role: "The atoms inside Projects: Tasks, Captures, (soon) Wiki Pages",
    anchor: null, // FRAMEWORK.md anchor for this category to be added in a follow-up
  },
  {
    name: "Calendar",
    role: "Google Calendar (external). JARVIS reads it for time context.",
    anchor: "calendar",
  },
  {
    name: "JARVIS",
    role: "The orchestrator. Routes across the hierarchy, holds full context.",
    anchor: "jarvis",
  },
] as const;

export function PrimitivesTable() {
  return (
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 05 · THE PRIMITIVES" />

      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        A small hierarchy. One agent.
      </h2>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Most productivity apps give you ten kinds of object and call that
        flexibility. To me it&rsquo;s closer to a furniture store. What I
        actually wanted was the opposite: the smallest set of primitives that
        could still cover the whole surface area of a life without forcing
        me to specialize.
      </p>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Hyperpolymath is structured as a small hierarchy. Areas at the top,
        your life domains. Projects inside Areas, the bounded efforts (your
        classes live here too). Inside Projects sit the Building Blocks:
        Tasks today, Captures today, Wiki Pages soon. Time itself lives in
        Google Calendar, which JARVIS reads directly rather than mirroring.
        JARVIS sits over the whole structure as the orchestrator, with full
        context from every building block on up to your top-level Areas.
      </p>

      {/* Structure tree — styled JSX tree with CSS-drawn connector lines.
          Each primitive renders as a name pill + role caption. JARVIS gets
          the cyan signature treatment to read as the centerpiece. The
          Area→Project nesting is the only place a child branch exists.
          Sits between the methodology paragraphs and the spec table so the
          reader gets shape before they get the contract. */}
      <div className="mt-8">
        <SectionEyebrow label="STRUCTURE" />
        <div className="mt-3 overflow-x-auto custom-scrollbar">
          <PrimitiveTree />
        </div>
      </div>

      <div className="mt-8">
        {/* Column header row */}
        <div className="grid grid-cols-[160px_1fr_60px] items-center border-b border-[var(--edge)] pb-3">
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
            key={p.name}
            className="grid grid-cols-[160px_1fr_60px] items-center min-h-[56px] border-b border-[var(--edge)]"
          >
            <span className="font-mono text-[14px] font-medium tracking-[0.04em] text-[var(--ink)]">
              {p.name}
            </span>
            <span className="font-serif text-[18px] leading-[1.4] text-[var(--ink)]">
              {p.role}
            </span>
            {p.anchor ? (
              <a
                href={`${GITHUB_FRAMEWORK_BASE}#${p.anchor}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Read the ${p.name} spec in FRAMEWORK.md on GitHub`}
                className="justify-self-end text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
              >
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Styled hierarchy tree for §04. JARVIS is NOT a branch — it's the
 * envelope. The outer container has a cyan --edge-hud border + soft
 * --glow-hud-subtle shadow, with a JARVIS label at top, signaling that
 * the agent permeates every data primitive inside it. The data
 * primitives (Areas → Projects, Captures, Calendar) sit inside the
 * envelope as the actual tree.
 */
function PrimitiveTree() {
  return (
    <div
      className="font-serif text-[18px] leading-[1.4] text-[var(--ink)] relative p-6 md:p-7 rounded bg-[var(--surface-raised)]"
      style={{
        border: "1px solid var(--edge-hud)",
        boxShadow: "var(--glow-hud-subtle)",
      }}
    >
      {/* JARVIS envelope header — declares "everything inside is touched
          by the agent" */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 pb-5 mb-5 border-b border-[var(--edge-hud)]">
        <span
          className="inline-flex items-center font-mono text-[14px] font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
          style={{
            color: "var(--hud-cyan-light)",
            border: "1px solid var(--edge-hud)",
            background: "var(--surface)",
            boxShadow: "var(--glow-hud-subtle)",
          }}
        >
          <span className="mr-1.5">⚜</span>
          JARVIS
        </span>
        <span className="font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)] sm:translate-y-[1px]">
          A friendly, all-knowing orchestrator across every primitive below,
          with one eye on your Google Calendar.
        </span>
      </div>

      {/* Areas is the top of the hierarchy. Projects nest one level below.
          Building Blocks nest one level below that, with Tasks / Captures /
          (soon) Wiki Pages as the concrete leaf types. */}
      <RootPill label="Areas" />
      <ul className="tree-branch mt-2">
        <Branch
          name="Projects"
          role="bounded efforts inside an Area (incl. Classes)"
          last
        >
          <ul className="tree-branch mt-2">
            <Branch
              name="Building Blocks"
              role="the atoms inside Projects"
              last
            >
              <ul className="tree-branch mt-2">
                <Branch
                  name="Tasks"
                  role="work items with due dates and priorities"
                />
                <Branch
                  name="Captures"
                  role="frictionless inbox notes, filed into a Project"
                />
                <Branch
                  name="Wiki Pages"
                  role="long-form notes (coming soon)"
                  muted
                  last
                />
              </ul>
            </Branch>
          </ul>
        </Branch>
      </ul>

      {/* External callout for Calendar — sits outside the data hierarchy
          because Google Calendar is the source of truth for time and is
          never duplicated into Hyperpolymath. JARVIS reads from it. */}
      <div className="mt-6 pt-5 border-t border-[var(--edge)]">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span
            className="inline-flex items-center font-mono text-[14px] font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
            style={{
              color: "var(--ink-muted)",
              border: "1px solid var(--edge)",
              background: "var(--surface)",
            }}
          >
            Calendar
            <span
              className="ml-2 text-[12px] uppercase tracking-[0.08em]"
              style={{ color: "var(--ink-muted)" }}
            >
              external
            </span>
          </span>
          <span className="font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)] sm:translate-y-[1px]">
            Google Calendar lives outside the hierarchy. JARVIS reads it
            for time context; events are never duplicated here.
          </span>
        </div>
      </div>

      {/* Connector styling — scoped inline so we don't add to globals.css */}
      <style>{`
        .tree-branch {
          list-style: none;
          padding-left: 1.5rem;
          margin: 0;
          position: relative;
        }
        .tree-branch > li {
          position: relative;
          padding: 0.5rem 0 0.5rem 1.25rem;
        }
        .tree-branch > li::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 1rem;
          height: 1.25rem;
          border-bottom: 1px solid var(--edge);
          border-left: 1px solid var(--edge);
          border-bottom-left-radius: 4px;
        }
        .tree-branch > li:not(.is-last)::after {
          content: "";
          position: absolute;
          top: 1.25rem;
          left: 0;
          bottom: 0;
          border-left: 1px solid var(--edge);
        }
      `}</style>
    </div>
  );
}

function RootPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center font-mono text-[14px] font-medium tracking-[0.04em] text-[var(--ink)] px-3 py-1 border border-[var(--edge)] bg-[var(--surface-raised)] rounded">
      {label}
    </div>
  );
}

function Branch({
  name,
  role,
  accent,
  muted = false,
  last = false,
  children,
}: {
  name: string;
  role: string;
  accent?: "cyan";
  /** Renders the pill + role at reduced opacity to mark "coming soon" items. */
  muted?: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const cyan = accent === "cyan";
  return (
    <li className={last ? "is-last" : ""} style={muted ? { opacity: 0.55 } : undefined}>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <span
          className="inline-flex items-center font-mono text-[14px] font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
          style={
            cyan
              ? {
                  color: "var(--hud-cyan-light)",
                  border: "1px solid var(--edge-hud)",
                  background: "var(--surface-raised)",
                  boxShadow: "var(--glow-hud-subtle)",
                }
              : {
                  color: "var(--ink)",
                  border: muted ? "1px dashed var(--edge)" : "1px solid var(--edge)",
                  background: "var(--surface-raised)",
                }
          }
        >
          {cyan ? <span className="mr-1.5">⚜</span> : null}
          {name}
        </span>
        <span className="font-serif text-[18px] leading-[1.5] text-[var(--ink-muted)] sm:translate-y-[1px]">
          {role}
        </span>
      </div>
      {children}
    </li>
  );
}
