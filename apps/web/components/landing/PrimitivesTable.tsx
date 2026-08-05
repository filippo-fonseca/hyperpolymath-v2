import type { ReactNode } from "react";
import { ArrowUpRight, Calendar } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { Reveal } from "./Reveal";
import {
  AreaIcon,
  FolderIcon,
  WidgetIcon,
  JarvisIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

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
  /** Dimensional icon for the noun (or a lucide glyph for the external one). */
  icon: (size: number) => ReactNode;
};

const PRIMITIVES: ReadonlyArray<Primitive> = [
  {
    name: "Areas",
    role: "Top-level life domains (Health, School, Work, …)",
    anchor: "areas",
    icon: (s) => <AreaIcon size={s} />,
  },
  {
    name: "Projects",
    role: "Bounded efforts inside an Area (incl. Classes)",
    anchor: "projects",
    icon: (s) => <FolderIcon size={s} />,
  },
  {
    name: "Building Blocks",
    role: "The atoms inside Projects: Tasks, Captures, and Wiki Pages",
    anchor: null, // FRAMEWORK.md anchor for this category to be added in a follow-up
    icon: (s) => <WidgetIcon size={s} />,
  },
  {
    name: "Calendar",
    role: "Google Calendar (external). JARVIS reads it for time context.",
    anchor: "calendar",
    // External surface — a quiet lucide glyph, not a dimensional noun icon.
    icon: (s) => (
      <Calendar size={Math.round(s * 0.62)} strokeWidth={1.75} />
    ),
  },
  {
    name: "JARVIS",
    role: "The orchestrator. Routes across the hierarchy, holds full context.",
    anchor: "jarvis",
    icon: (s) => <JarvisIcon size={s} />,
  },
] as const;

export function PrimitivesTable() {
  return (
    <Reveal as="section" className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 05 · THE PRIMITIVES" />

      <h2 className="mt-2 font-semibold text-headline leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
        A small hierarchy. One agent.
      </h2>

      <p className="mt-4 text-lead leading-[1.6] text-[var(--sd-ink)]">
        Most productivity apps give you ten kinds of object and call that
        flexibility. To me it&rsquo;s closer to a furniture store. What I
        actually wanted was the opposite: the smallest set of primitives that
        could still cover the whole surface area of a life without forcing
        me to specialize.
      </p>

      <p className="mt-4 text-lead leading-[1.6] text-[var(--sd-ink)]">
        Hyperpolymath is structured as a small hierarchy. Areas at the top,
        your life domains. Projects inside Areas, the bounded efforts (your
        classes live here too). Inside Projects sit the Building Blocks:
        Tasks, Captures, and Wiki Pages. Wiki Pages are long-form, block-based
        notes you can organize in folders and write JARVIS straight into:
        type <span className="font-mono">@JARVIS</span> anywhere in a page and
        it acts on that block, section, or the whole document in place. Time
        itself lives in Google Calendar, which JARVIS reads directly rather
        than mirroring. JARVIS sits over the whole structure as the
        orchestrator, with full context from every building block on up to
        your top-level Areas.
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

      {/* Spec table — icon-led rows. Each primitive leads with its dimensional
          icon (the register's nouns-as-objects motif); the external Calendar
          gets a quiet lucide glyph instead. Hairline-only rows, no zebra. */}
      <div className="mt-8">
        {/* Column header row */}
        <div className="grid grid-cols-[44px_140px_1fr_40px] items-center gap-x-3 border-b border-[var(--sd-line)] pb-3">
          <span aria-hidden="true" />
          <span className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
            PRIMITIVE
          </span>
          <span className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
            ROLE
          </span>
          <span className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] text-right hidden md:inline">
            SPEC
          </span>
        </div>

        {/* Primitive rows */}
        {PRIMITIVES.map((p) => (
          <div
            key={p.name}
            className="grid grid-cols-[44px_140px_1fr_40px] items-center gap-x-3 min-h-[60px] border-b border-[var(--sd-line)]"
          >
            <span
              className="inline-flex size-9 items-center justify-center text-[var(--sd-ink-faint)]"
              aria-hidden="true"
            >
              {p.icon(30)}
            </span>
            <span className="font-mono text-body font-medium tracking-[0.02em] text-[var(--sd-ink)]">
              {p.name}
            </span>
            <span className="text-subtitle leading-[1.4] text-[var(--sd-ink-dull)]">
              {p.role}
            </span>
            {p.anchor ? (
              <a
                href={`${GITHUB_FRAMEWORK_BASE}#${p.anchor}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Read the ${p.name} spec in FRAMEWORK.md on GitHub`}
                className="justify-self-end text-[var(--sd-ink-faint)] hover:text-[var(--sd-accent)] transition-colors"
              >
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/**
 * Styled hierarchy tree for §04. JARVIS is NOT a branch — it's the
 * envelope. The outer container is a card-v2 plate with a cyan-tinted
 * hairline edge (the single accent, no glow) and a JARVIS label at top,
 * signaling that the agent permeates every data primitive inside it. The
 * data primitives (Areas → Projects, Building Blocks, Calendar) sit inside
 * the envelope as the actual tree, connected by static sd-line strokes.
 */
function PrimitiveTree() {
  return (
    <div
      className="text-lead leading-[1.4] text-[var(--sd-ink)] relative p-6 md:p-7 rounded-[14px] bg-[var(--sd-box)]"
      style={{
        // The one accent surface in this section: a cyan-tinted edge, no glow.
        border:
          "1px solid color-mix(in oklch, var(--sd-accent) 30%, var(--sd-line))",
      }}
    >
      {/* JARVIS envelope header — declares "everything inside is touched
          by the agent" */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 pb-5 mb-5 border-b border-[var(--sd-line)]">
        <span
          className="inline-flex items-center whitespace-nowrap font-mono text-body font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
          style={{
            color: "var(--sd-accent)",
            border: "1px solid var(--sd-line)",
            background: "var(--sd-input)",
            boxShadow: "none",
          }}
        >
          <span className="mr-1.5">⚜</span>
          JARVIS
        </span>
        <span className="italic text-lead leading-[1.5] text-[var(--sd-ink-faint)] sm:translate-y-[1px]">
          A friendly, all-knowing orchestrator across every primitive below,
          with one eye on your Google Calendar.
        </span>
      </div>

      {/* Areas is the top of the hierarchy. Projects nest one level below.
          Building Blocks nest one level below that, with Tasks / Captures /
          Wiki Pages as the concrete leaf types. */}
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
                  role="long-form notes in folders, with in-document @JARVIS + Daily Pages"
                />
                <Branch
                  name="+  more"
                  role="the schema is open (new block types plug in here as the life-OS grows)"
                  slot
                  last
                />
              </ul>
            </Branch>
          </ul>
        </Branch>
      </ul>

      {/* External callout for Calendar — sits outside the data hierarchy
          because Google Calendar is the source of truth for time and is
          never duplicated into Hyperpolymath. JARVIS reads from it.

          The "+ more" slot beneath signals that the external surface is
          plug-in: Gmail, Drive, Strava, etc. attach to JARVIS the same
          way Calendar does. Paired with the "+ more" slot under Building
          Blocks above, this makes the modular shape of the system
          legible without claiming any of it ships today. */}
      <div className="mt-6 pt-5 border-t border-[var(--sd-line)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span
            className="inline-flex items-center font-mono text-body font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
            style={{
              color: "var(--sd-ink-faint)",
              border: "1px solid var(--sd-line)",
              background: "var(--sd-input)",
            }}
          >
            Calendar
            <span
              className="ml-2 text-micro uppercase tracking-[0.08em]"
              style={{ color: "var(--sd-ink-faint)" }}
            >
              external
            </span>
          </span>
          <span className="italic text-lead leading-[1.5] text-[var(--sd-ink-faint)] sm:translate-y-[1px]">
            Google Calendar lives outside the hierarchy. JARVIS reads it
            for time context; events are never duplicated here.
          </span>
        </div>

        {/* Extensibility slot — parallels the "+ more" leaf under Building
            Blocks. Same dashed-cyan pill so the visual reads as "open seam". */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span
            className="inline-flex items-center font-mono text-body font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
            style={{
              color: "var(--sd-accent)",
              border: "1px dashed var(--sd-line)",
              background:
                "color-mix(in oklch, var(--sd-accent) 6%, var(--sd-box))",
            }}
          >
            +&nbsp; more
            <span
              className="ml-2 text-micro uppercase tracking-[0.08em]"
              style={{ color: "var(--sd-accent)" }}
            >
              external
            </span>
          </span>
          <span className="italic text-lead leading-[1.5] text-[var(--sd-ink-faint)] sm:translate-y-[1px]">
            Gmail, Drive, Strava, Notion. Anything JARVIS can read.
            External systems plug in the same way Calendar does.
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
          border-bottom: 1px solid var(--sd-line);
          border-left: 1px solid var(--sd-line);
          border-bottom-left-radius: 4px;
        }
        .tree-branch > li:not(.is-last)::after {
          content: "";
          position: absolute;
          top: 1.25rem;
          left: 0;
          bottom: 0;
          border-left: 1px solid var(--sd-line);
        }
      `}</style>
    </div>
  );
}

function RootPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center font-mono text-body font-medium tracking-[0.04em] text-[var(--sd-ink)] px-3 py-1 border border-[var(--sd-line)] bg-[var(--sd-box)] rounded">
      {label}
    </div>
  );
}

function Branch({
  name,
  role,
  accent,
  muted = false,
  slot = false,
  last = false,
  children,
}: {
  name: string;
  role: string;
  accent?: "cyan";
  /** Renders the pill + role at reduced opacity to mark "coming soon" items. */
  muted?: boolean;
  /** Marks the row as an open extensibility slot (dashed cyan, italic role). */
  slot?: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const cyan = accent === "cyan";
  return (
    <li
      className={last ? "is-last" : ""}
      style={muted && !slot ? { opacity: 0.55 } : undefined}
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <span
          className="inline-flex items-center whitespace-nowrap font-mono text-body font-medium tracking-[0.04em] px-3 py-1 rounded self-start"
          style={
            cyan
              ? {
                  color: "var(--sd-accent)",
                  border: "1px solid var(--sd-line)",
                  background: "var(--sd-box)",
                  boxShadow: "none",
                }
              : slot
                ? {
                    color: "var(--sd-accent)",
                    border: "1px dashed var(--sd-line)",
                    background:
                      "color-mix(in oklch, var(--sd-accent) 6%, var(--sd-box))",
                  }
                : {
                    color: "var(--sd-ink)",
                    border: muted
                      ? "1px dashed var(--sd-line)"
                      : "1px solid var(--sd-line)",
                    background: "var(--sd-box)",
                  }
          }
        >
          {cyan ? <span className="mr-1.5">⚜</span> : null}
          {name}
        </span>
        <span
          className={cn(
            "text-lead leading-[1.5] sm:translate-y-[1px]",
            slot ? "italic text-[var(--sd-ink-faint)]" : "text-[var(--sd-ink-faint)]",
          )}
        >
          {role}
        </span>
      </div>
      {children}
    </li>
  );
}
