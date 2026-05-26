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
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
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

      {/* Structure tree — styled JSX tree with CSS-drawn connector lines.
          Each primitive renders as a name pill + role caption. JARVIS gets
          the cyan signature treatment to read as the centerpiece. The
          Area→Project nesting is the only place a child branch exists.
          Sits between the methodology paragraphs and the spec table so the
          reader gets shape before they get the contract. */}
      <div className="mt-8">
        <SectionEyebrow label="STRUCTURE" />
        <div
          className="mt-3 p-6 md:p-8 bg-[var(--surface)] border border-[var(--edge)] rounded overflow-x-auto custom-scrollbar"
          aria-label="Hyperpolymath primitive tree"
        >
          <PrimitiveTree />
        </div>
      </div>

      <div className="mt-8">
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

/**
 * Styled hierarchy tree for §03. Uses CSS-drawn connector lines
 * (border-left + border-bottom on each node) rather than ASCII or SVG.
 *
 * Visual grammar:
 *   - Root label sits at top, no incoming connector.
 *   - Each child renders as a pill (mono name) + role caption to its right.
 *   - Connector is a 1px --edge L-shape drawn via ::before pseudo-positioning.
 *   - The vertical spine continues down the left edge for non-last children
 *     via ::after pseudo on each branch.
 *   - JARVIS is the cyan-accented leaf: pill border --edge-hud, label
 *     --hud-cyan, faint glow. Reads as the centerpiece signature.
 */
function PrimitiveTree() {
  return (
    <div className="font-serif text-[18px] leading-[1.4] text-[var(--ink)]">
      <RootPill label="Hyperpolymath" />
      <ul className="tree-branch mt-2">
        <Branch
          name="Areas"
          role="top-level life domains (Health, School, Work, …)"
        >
          <ul className="tree-branch mt-2">
            <Branch
              name="Projects"
              role="bounded efforts inside an area (incl. Classes)"
              last
            />
          </ul>
        </Branch>
        <Branch
          name="Captures"
          role="frictionless inbox for fleeting thoughts"
        />
        <Branch
          name="Calendar"
          role="Google Calendar, the source of truth for time"
        />
        <Branch
          name="JARVIS"
          role="natural-language router across every primitive above"
          accent="cyan"
          last
        />
      </ul>

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
  last = false,
  children,
}: {
  name: string;
  role: string;
  accent?: "cyan";
  last?: boolean;
  children?: React.ReactNode;
}) {
  const cyan = accent === "cyan";
  return (
    <li className={last ? "is-last" : ""}>
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
                  border: "1px solid var(--edge)",
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
