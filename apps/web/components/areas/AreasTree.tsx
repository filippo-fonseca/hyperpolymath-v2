"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Archive } from "lucide-react";
import { AreaIcon } from "@/components/ui/icons";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { cn } from "@/lib/utils";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  areas: SidebarArea[];
  rootAvatarUrl: string | null;
  rootInitial: string;
  /** Used only for the avatar's alt text — not displayed in the tree. */
  rootLabel: string;
}

const HIDE_ALL_KEY = "areas-tree-hide-all-projects";
const SHOW_ARCHIVED_KEY = "areas-tree-show-archived";
const PER_AREA_COLLAPSED_PREFIX = "areas-tree-collapsed-";

/**
 * Areas homepage — orthogonal tree with the user's avatar as root.
 *
 * Layout discipline:
 *   - Root (PFP) sits centered at the top.
 *   - Single vertical TRUNK drops out of the PFP.
 *   - A horizontal JUNCTION spans the area row.
 *   - Each area gets a vertical BRANCH from the junction down to its card.
 *   - Connectors are ORTHOGONAL (not curved) so the tree reads as a tree
 *     rather than as a circulatory diagram, AND the animated feed dots
 *     travel cleanly along right-angled paths.
 *   - Paths terminate at the TOP of each area card. They never pass over
 *     or behind any text — text-not-in-the-way was the explicit fix.
 *
 * Register: Spacedrive sd grammar. Connectors are a single neutral hairline
 * (--edge-hud) rather than a per-node rainbow; the one accent moment is the
 * cyan feed pulse + vertex node, honoring the one-hue-owns-the-app law (D6).
 * The pulse is ambient and infinite, so it is gated behind reduced-motion.
 *
 * Measurement: ResizeObserver on container + root + each card ref lets us
 * recompute path coordinates on resize without locking the layout to math
 * assumptions about area count or card width. Card tops stay put when a
 * sub-branch expands below them, so connectors never shift during a collapse.
 */

const TRUNK_DROP = 36; // px the trunk falls before reaching the junction
const BRANCH_RISE = 32; // px the branch rises off the top of each card

// Single neutral hairline for the whole tree backbone (theme-aware, faint
// cyan tint via --edge-hud). The pulse + vertices carry the lone cyan accent.
const CONNECTOR = "color-mix(in oklch, var(--edge-hud) 85%, transparent)";
const PULSE = "var(--sd-accent)";

export function AreasTree({
  areas,
  rootAvatarUrl,
  rootInitial,
  rootLabel,
}: Props) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [cardVertices, setCardVertices] = useState<
    { id: string; cx: number; cy: number }[]
  >([]);
  const [junctionLines, setJunctionLines] = useState<
    { x1: number; x2: number; y: number }[]
  >([]);
  const [trunkLine, setTrunkLine] = useState<{
    x: number;
    y1: number;
    y2: number;
  } | null>(null);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  // ── Tree view controls — persisted in localStorage so the user's prefs
  // survive reloads. Per-area collapse uses a Set so we only touch storage
  // for areas the user has explicitly toggled (everything else is
  // expanded-by-default no matter how the area set evolves).
  const [hideAllProjects, setHideAllProjects] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHideAllProjects(localStorage.getItem(HIDE_ALL_KEY) === "true");
    setShowArchived(localStorage.getItem(SHOW_ARCHIVED_KEY) === "true");
    // Per-area: scan for keys we own and rebuild the Set.
    const collapsed = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith(PER_AREA_COLLAPSED_PREFIX) &&
        localStorage.getItem(k) === "true"
      ) {
        collapsed.add(k.slice(PER_AREA_COLLAPSED_PREFIX.length));
      }
    }
    setCollapsedAreas(collapsed);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(HIDE_ALL_KEY, String(hideAllProjects));
  }, [hideAllProjects]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem(SHOW_ARCHIVED_KEY, String(showArchived));
  }, [showArchived]);

  function toggleArea(id: string) {
    setCollapsedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (typeof window !== "undefined")
          localStorage.removeItem(PER_AREA_COLLAPSED_PREFIX + id);
      } else {
        next.add(id);
        if (typeof window !== "undefined")
          localStorage.setItem(PER_AREA_COLLAPSED_PREFIX + id, "true");
      }
      return next;
    });
  }

  useEffect(() => {
    const container = containerRef.current;
    const root = rootRef.current;
    if (!container || !root) return;

    function measure() {
      if (!container || !root) return;
      const containerRect = container.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();

      const rootCx = rootRect.left + rootRect.width / 2 - containerRect.left;
      const rootBottom = rootRect.bottom - containerRect.top;

      const cardCenters: { id: string; cx: number; top: number }[] = [];
      for (const [id, el] of cardRefs.current.entries()) {
        const r = el.getBoundingClientRect();
        cardCenters.push({
          id,
          cx: r.left + r.width / 2 - containerRect.left,
          top: r.top - containerRect.top,
        });
      }
      if (cardCenters.length === 0) {
        setPaths([]);
        setCardVertices([]);
        setJunctionLines([]);
        setTrunkLine(null);
        setSvgSize({ w: containerRect.width, h: containerRect.height });
        return;
      }

      // Bucket cards into rows by `top` coordinate. Cards within 8px of each
      // other are treated as part of the same row (handles minor sub-pixel
      // jitter from getBoundingClientRect on different viewports).
      const sortedByTop = [...cardCenters].sort((a, b) => a.top - b.top);
      const rows: { id: string; cx: number; top: number }[][] = [];
      for (const c of sortedByTop) {
        const lastRow = rows[rows.length - 1];
        if (lastRow && Math.abs(c.top - lastRow[0].top) < 8) {
          lastRow.push(c);
        } else {
          rows.push([c]);
        }
      }

      // Special case: single card (also single row of 1). Straight vertical
      // from root to card with no junction needed.
      if (cardCenters.length === 1) {
        const only = cardCenters[0];
        const branchEndY = Math.max(rootBottom + TRUNK_DROP, only.top - 2);
        setPaths([{ id: only.id, d: `M ${rootCx} ${rootBottom} V ${branchEndY}` }]);
        setCardVertices([{ id: only.id, cx: rootCx, cy: branchEndY }]);
        setJunctionLines([]);
        setTrunkLine(null);
        setSvgSize({ w: containerRect.width, h: containerRect.height });
        return;
      }

      // For each row: junction sits BRANCH_RISE above the cards' top. Include
      // rootCx in the junction span so the trunk visually connects in even if
      // all cards in a row lie to one side.
      const junctions: { x1: number; x2: number; y: number }[] = [];
      const nextPaths: { id: string; d: string }[] = [];
      const nextVertices: { id: string; cx: number; cy: number }[] = [];
      let lastJunctionY = rootBottom + TRUNK_DROP;
      for (const row of rows) {
        const rowMinX = Math.min(...row.map((c) => c.cx));
        const rowMaxX = Math.max(...row.map((c) => c.cx));
        const rowJunctionY = row[0].top - BRANCH_RISE;
        junctions.push({
          x1: Math.min(rowMinX, rootCx),
          x2: Math.max(rowMaxX, rootCx),
          y: rowJunctionY,
        });
        for (const c of row) {
          const branchEndY = Math.max(rowJunctionY, c.top - 2);
          nextPaths.push({
            id: c.id,
            d: `M ${rootCx} ${rowJunctionY} H ${c.cx} V ${branchEndY}`,
          });
          nextVertices.push({ id: c.id, cx: c.cx, cy: branchEndY });
        }
        lastJunctionY = rowJunctionY;
      }

      // One continuous trunk spine from rootBottom down to the LAST row's
      // junction Y. Passes through every intermediate junction (they share
      // x=rootCx by construction), visually unifying multi-row layouts.
      setPaths(nextPaths);
      setCardVertices(nextVertices);
      setJunctionLines(junctions);
      setTrunkLine({ x: rootCx, y1: rootBottom, y2: lastJunctionY });
      setSvgSize({ w: containerRect.width, h: containerRect.height });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(root);
    for (const el of cardRefs.current.values()) ro.observe(el);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
    };
  }, [areas.length]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Top control bar — pinned at the top of the tree section so the
          view controls live in their own band, separate from the tree
          itself. Mono "VIEW" eyebrow on the left grounds the bar as a
          chrome strip; pills on the right. Hairline border below the bar
          gives it just enough separation from the canvas without becoming
          a card. */}
      <div className="flex items-center justify-between gap-4 px-2 pb-3 mb-4 border-b border-[var(--edge)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          View
        </span>
        <div className="flex items-center gap-2">
          <TogglePill
            active={!hideAllProjects}
            onClick={() => setHideAllProjects((v) => !v)}
            label={hideAllProjects ? "Show projects" : "Hide projects"}
            title={
              hideAllProjects
                ? "Show all project sub-branches"
                : "Hide all project sub-branches"
            }
          />
          <TogglePill
            active={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            label={showArchived ? "Hiding archived" : "Show archived"}
            title={
              showArchived
                ? "Hide archived projects"
                : "Include archived projects in the tree"
            }
            icon={<Archive size={11} />}
          />
        </div>
      </div>
      <svg
        aria-hidden="true"
        width={svgSize.w}
        height={svgSize.h}
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: "visible" }}
      >
        <defs>
          <filter id="feed-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* Trunk spine — one continuous vertical from root through every row's
            junction. Multi-row layouts get a single visual backbone. */}
        {trunkLine ? (
          <line
            x1={trunkLine.x}
            y1={trunkLine.y1}
            x2={trunkLine.x}
            y2={trunkLine.y2}
            stroke={CONNECTOR}
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        ) : null}

        {/* Per-row junctions — one horizontal segment per wrapped row, drawn
            separately from the per-area paths so animated dots don't
            double-travel along the junction. */}
        {junctionLines.map((j, i) => (
          <line
            key={`junction-${i}`}
            x1={j.x1}
            y1={j.y}
            x2={j.x2}
            y2={j.y}
            stroke={CONNECTOR}
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        ))}

        {paths.map((p, i) => (
          <g key={p.id}>
            <path
              id={`feed-path-${p.id}`}
              d={p.d}
              fill="none"
              stroke={CONNECTOR}
              strokeWidth="1.25"
              strokeLinecap="round"
            />
            {/* Cyan feed pulse — the single accent moment. Ambient + infinite,
                so it is disabled entirely under reduced motion (D1d). */}
            {prefersReducedMotion ? null : (
              <>
                <circle r="3.5" fill={PULSE} filter="url(#feed-glow)" opacity="0.7">
                  <animateMotion
                    dur="2.6s"
                    repeatCount="indefinite"
                    begin={`${(i * 0.35).toFixed(2)}s`}
                  >
                    <mpath href={`#feed-path-${p.id}`} />
                  </animateMotion>
                </circle>
                <circle r="1.5" fill={PULSE}>
                  <animateMotion
                    dur="2.6s"
                    repeatCount="indefinite"
                    begin={`${(i * 0.35).toFixed(2)}s`}
                  >
                    <mpath href={`#feed-path-${p.id}`} />
                  </animateMotion>
                </circle>
              </>
            )}
          </g>
        ))}

        {/* Vertex dots — a cyan node at the top of every area card where its
            branch terminates. Outer halo + canvas-filled ring reads as a
            graph vertex, and carries the lone accent hue alongside the pulse. */}
        {cardVertices.map((v) => (
          <g key={`vertex-${v.id}`}>
            <circle
              cx={v.cx}
              cy={v.cy}
              r="5.5"
              fill={PULSE}
              opacity="0.16"
              filter="url(#feed-glow)"
            />
            <circle
              cx={v.cx}
              cy={v.cy}
              r="3"
              fill="var(--canvas)"
              stroke={PULSE}
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>

      {/* Root — just the avatar. Strict pixel width AND height on both the
          wrapper AND the <img> defends against any global rule that might
          stretch <img> elements (which was happening; the user reported the
          PFP filling the page). The ambient cyan pulse is a sibling span,
          not a parent — keeps the photo's bounding box untouched, and is
          suppressed under reduced motion. */}
      <div className="relative z-10 flex justify-center pt-1 pb-1">
        <div
          ref={rootRef}
          className="relative shrink-0 overflow-hidden rounded-xl border border-[var(--edge-hud)] bg-[var(--surface-raised)]"
          style={{
            width: 72,
            height: 72,
            boxShadow:
              "0 0 0 1px color-mix(in oklch, var(--sd-accent) 32%, transparent), 0 0 20px color-mix(in oklch, var(--sd-accent) 14%, transparent)",
          }}
        >
          {prefersReducedMotion ? null : (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl animate-pulse"
              style={{
                boxShadow:
                  "0 0 0 4px color-mix(in oklch, var(--sd-accent) 8%, transparent)",
              }}
            />
          )}
          {rootAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rootAvatarUrl}
              alt={rootLabel}
              width={72}
              height={72}
              style={{
                width: 72,
                height: 72,
                maxWidth: 72,
                maxHeight: 72,
                display: "block",
                objectFit: "cover",
              }}
            />
          ) : (
            <span
              className="font-serif text-2xl text-[var(--ink-muted)] flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              {rootInitial}
            </span>
          )}
        </div>
      </div>

      {/* Spacer matches TRUNK_DROP so the trunk has room to draw without
          colliding with the label above or the area row below. */}
      <div style={{ height: TRUNK_DROP }} aria-hidden="true" />

      {/* Area row. Wraps onto multiple rows when width is exceeded — the
          measurement pass buckets cards into rows and emits one junction
          segment per row plus a continuous trunk through them all. */}
      <div className="relative z-10">
        <div
          className="flex flex-wrap items-start justify-center gap-x-8 gap-y-12 px-4 pb-4"
          style={{ paddingTop: BRANCH_RISE }}
        >
          {areas.length === 0 ? (
            <EmptyAreas />
          ) : (
            areas.map((area) => (
              <AreaBranch
                key={area.id}
                area={area}
                setRef={(el) => {
                  if (el) cardRefs.current.set(area.id, el);
                  else cardRefs.current.delete(area.id);
                }}
                collapsed={hideAllProjects || collapsedAreas.has(area.id)}
                onToggleCollapse={() => toggleArea(area.id)}
                showArchived={showArchived}
                reducedMotion={!!prefersReducedMotion}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TogglePill({
  active,
  onClick,
  label,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] border",
        "font-mono text-[10px] uppercase tracking-[0.08em] cursor-pointer-always",
        "transition-colors duration-[120ms] ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
        active
          ? "border-[var(--edge)] bg-[var(--surface-raised)] text-[var(--ink)]"
          : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Sub-branch geometry — tuned so the tree feels like a tree:
 *   STEM_DROP   how far the trunk falls from the area card bottom to the
 *               first horizontal tick. A clear vertical pause sells the
 *               "another level down" reading.
 *   TICK_TOP    the y-offset of each horizontal tick inside its <li>. Aligns
 *               the tick to the project row's visual midline.
 *   TICK_WIDTH  how far the horizontal tick extends to the right. Longer
 *               ticks read more as "branches", shorter as "bullets".
 */
const STEM_DROP = 14;
const TICK_TOP = 13;
const TICK_WIDTH = 14;

function AreaBranch({
  area,
  setRef,
  collapsed,
  onToggleCollapse,
  showArchived,
  reducedMotion,
}: {
  area: SidebarArea;
  setRef: (el: HTMLAnchorElement | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  showArchived: boolean;
  reducedMotion: boolean;
}) {
  // Server fetches the full set (active + archived) so we can flip the
  // archived view without a round-trip. Filter here based on toggle.
  const visibleProjects = showArchived
    ? area.projects
    : area.projects.filter((p) => p.archivedAt === null);
  const activeCount = area.projects.filter(
    (p) => p.archivedAt === null,
  ).length;
  const archivedCount = area.projects.length - activeCount;
  const previewProjects = visibleProjects.slice(0, 6);
  const hiddenCount = visibleProjects.length - previewProjects.length;
  const lineColor = "color-mix(in oklch, var(--edge-hud) 60%, transparent)";

  // Collapse choreography — height:auto reveal on the campaign easing, with
  // leaf rows staggered in beneath it. AnimatePresence initial={false}
  // suppresses the enter animation on first paint (no mount flash, D1d), and
  // the durations collapse to 0 under reduced motion.
  const container = {
    hidden: {
      height: 0,
      opacity: 0,
      transition: {
        duration: reducedMotion ? 0 : 0.2,
        ease: [0.32, 0.72, 0, 1] as const,
        when: "afterChildren" as const,
        staggerChildren: reducedMotion ? 0 : 0.01,
        staggerDirection: -1 as const,
      },
    },
    show: {
      height: "auto" as const,
      opacity: 1,
      transition: {
        duration: reducedMotion ? 0 : 0.2,
        ease: [0.32, 0.72, 0, 1] as const,
        when: "beforeChildren" as const,
        staggerChildren: reducedMotion ? 0 : 0.01,
      },
    },
  };
  const leaf = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 4 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reducedMotion ? 0 : 0.16, ease: "easeOut" as const },
    },
  };

  return (
    <div className="flex flex-col items-stretch w-[240px] shrink-0">
      <div className="relative">
        <Link
          ref={setRef}
          href={`/areas/${area.id}`}
          className={cn(
            "group relative flex flex-col gap-2 rounded-xl px-3.5 py-3 pr-9",
            // sd entity-card grammar: translucent surface + hairline border +
            // white inset top hairline (D7) for dimensionality, elevation via
            // the grey ladder rather than shadow weight. --glass-* knobs let
            // /lifeos (.lifeos-glass) run frostier than /areas.
            "border border-[var(--edge)] bg-[var(--glass-bg)]",
            "[backdrop-filter:blur(var(--glass-blur,10px))] [-webkit-backdrop-filter:blur(var(--glass-blur,10px))]",
            "[box-shadow:inset_0_1px_0_rgba(255,255,255,0.06)]",
            "hover:border-[var(--edge-hud)] hover:bg-[color-mix(in_oklch,var(--surface-raised)_90%,transparent)]",
            "transition-colors duration-[120ms] ease-out cursor-pointer-always",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
          )}
        >
          <div className="flex items-center gap-2.5">
            {/* Icon in a subtle backplate (sd entity-card anatomy). Keeps the
                user's chosen emoji where set; defaults to the dimensional
                AreaIcon (advisor: never drop user data). */}
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-[var(--edge)] bg-[var(--surface)] text-[15px] leading-none"
            >
              {area.emoji ? area.emoji : <AreaIcon size={20} />}
            </span>
            <span className="min-w-0 flex-1 font-serif text-base font-semibold text-[var(--ink)] truncate">
              {area.name}
            </span>
          </div>
          <span className="text-right font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {activeCount} project{activeCount === 1 ? "" : "s"}
            {showArchived && archivedCount > 0 ? (
              <span className="ml-1 text-[var(--ink-muted)]/70">
                · {archivedCount} archived
              </span>
            ) : null}
          </span>
        </Link>
        {/* Per-area collapse toggle. Lives OUTSIDE the parent <Link> so the
            click doesn't navigate to the area page. Positioned absolutely
            in the card's top-right corner so it doesn't disturb the card's
            content flow. Single chevron rotates on state (soft-landing). */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleCollapse();
          }}
          aria-label={collapsed ? "Show projects" : "Hide projects"}
          aria-expanded={!collapsed}
          className={cn(
            "absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-[6px]",
            "text-[var(--ink-muted)] hover:text-[var(--ink)]",
            "border border-transparent hover:border-[var(--edge)] hover:bg-[var(--surface)]",
            "transition-colors duration-[120ms] ease-out cursor-pointer-always",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
          )}
        >
          <ChevronDown
            size={13}
            className="transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          />
        </button>
      </div>

      {/* Sub-branches — animate height:auto on toggle, and render NOTHING
          when collapsed (no empty space) so the area cards collapse
          vertically and the tree feels responsive. Card tops stay fixed
          while this grows below them, so the SVG connectors never shift.

          Geometry inside the visible branch:
            1. A short vertical STEM dropping from the spine origin down.
            2. A vertical SPINE down the left side of the project list at
               the same x as the stem.
            3. A horizontal TICK leaving the spine to each leaf row. The
               LEAF (icon + label) sits to the RIGHT of where the tick
               ENDS so the tick never strikes through the glyph. */}
      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            key="branch"
            variants={container}
            initial="hidden"
            animate="show"
            exit="hidden"
            // overflow-hidden clips content cleanly during the height reveal;
            // pb-1 keeps the last leaf's focus ring off the clip edge.
            className="relative overflow-hidden pb-1"
          >
            {previewProjects.length > 0 ? (
              <>
                <span
                  aria-hidden="true"
                  className="absolute left-3 -top-px w-px"
                  style={{ height: STEM_DROP, background: lineColor }}
                />
                <ul
                  className="flex flex-col gap-1.5 pl-3 relative"
                  style={{ marginTop: STEM_DROP - 2 }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-3 top-0 w-px"
                    style={{
                      background: lineColor,
                      height: `calc(100% - ${28 - TICK_TOP}px)`,
                    }}
                  />
                  {previewProjects.map((p) => {
                    const isArchived = p.archivedAt !== null;
                    return (
                      <motion.li
                        key={p.id}
                        variants={leaf}
                        className="relative"
                        // Leaf content starts AFTER the tick. tick spans
                        // x = [12, 12 + TICK_WIDTH]; leaf must start at
                        // ≥ tick.end + small breathing room. Hence pad by
                        // TICK_WIDTH + 12 (tick.start = 12 from li-left).
                        style={{ paddingLeft: TICK_WIDTH + 12 }}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute h-px"
                          style={{
                            left: 12,
                            top: TICK_TOP,
                            width: TICK_WIDTH,
                            background: lineColor,
                          }}
                        />
                        <Link
                          href={`/projects/${p.id}`}
                          className={cn(
                            "flex items-center gap-1.5 py-1 px-1.5 -ml-1.5 rounded-[6px]",
                            "font-serif text-[13px]",
                            "hover:bg-[var(--surface)] transition-colors duration-[120ms] ease-out",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
                            isArchived
                              ? "text-[var(--ink-muted)] italic"
                              : "text-[var(--ink)]",
                          )}
                        >
                          <DynamicIcon
                            name={p.icon}
                            size={12}
                            strokeWidth={1.5}
                            className="text-[var(--ink-muted)] shrink-0"
                          />
                          <span className="truncate">{p.name}</span>
                          {isArchived ? (
                            <Archive
                              size={10}
                              className="text-[var(--ink-muted)]/70 shrink-0"
                              aria-label="archived"
                            />
                          ) : null}
                        </Link>
                      </motion.li>
                    );
                  })}
                  {hiddenCount > 0 ? (
                    <motion.li
                      variants={leaf}
                      className="relative"
                      style={{ paddingLeft: TICK_WIDTH + 12 }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute h-px"
                        style={{
                          left: 12,
                          top: TICK_TOP,
                          width: TICK_WIDTH,
                          background: lineColor,
                        }}
                      />
                      <Link
                        href={`/areas/${area.id}`}
                        className="inline-flex rounded-[6px] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-[120ms] py-1 px-1 -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
                      >
                        + {hiddenCount} more
                      </Link>
                    </motion.li>
                  ) : null}
                </ul>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="absolute left-3 -top-px w-px"
                  style={{ height: STEM_DROP, background: lineColor }}
                />
                <p
                  className="font-serif italic text-[13px] text-[var(--ink-muted)] pl-7"
                  style={{ marginTop: STEM_DROP + 2 }}
                >
                  No projects yet.
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyAreas() {
  return (
    <div className="rounded-[8px] border border-dashed border-[var(--edge)] px-6 py-8 text-center max-w-md mx-auto">
      <p className="font-serif italic text-base text-[var(--ink-muted)]">
        No areas yet. Create one from the sidebar to start branching.
      </p>
    </div>
  );
}
