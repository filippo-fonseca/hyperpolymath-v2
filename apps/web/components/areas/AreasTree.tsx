"use client";

import { DynamicIcon } from "@/components/projects/DynamicIcon";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { cn } from "@/lib/utils";
import { Archive, ChevronDown, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
 * Animation: per-area SVG path with `animateMotion + mpath`. Pulses stagger
 * (begin += 0.35s per branch) so the feed reads as ambient circulation
 * rather than a synchronized loading bar. A larger blurred halo trails a
 * sharp nucleus for a comet-tail feel.
 *
 * Measurement: ResizeObserver on container + root + each card ref lets us
 * recompute path coordinates on resize without locking the layout to math
 * assumptions about area count or card width.
 */

const TRUNK_DROP = 36; // px the trunk falls before reaching the junction
const BRANCH_RISE = 32; // px the branch rises off the top of each card

/**
 * Per-area accent palette. Six soft oklch hues — pinks, turquoise, purple,
 * mint, amber, cyan — chosen to read as a constellation of distinct nodes
 * without breaking the journal-paper restraint. Each area is assigned a
 * stable color via a tiny string hash of its id (deterministic across
 * reloads). The same color drives both the SVG branch stroke AND the area
 * card's left-edge accent + top vertex dot.
 */
const NODE_PALETTE = [
  "oklch(72% 0.13 210)", // cyan (brand)
  "oklch(74% 0.14 350)", // pink
  "oklch(72% 0.14 305)", // purple
  "oklch(74% 0.13 175)", // turquoise
  "oklch(76% 0.15 155)", // mint / light green
  "oklch(80% 0.13 70)", // amber / peach
] as const;

function pickNodeColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length];
}

export function AreasTree({ areas, rootAvatarUrl, rootInitial, rootLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const reducedMotion = useReducedMotion();

  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [cardVertices, setCardVertices] = useState<{ id: string; cx: number; cy: number }[]>([]);
  const [junctionLines, setJunctionLines] = useState<{ x1: number; x2: number; y: number }[]>([]);
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
      if (k?.startsWith(PER_AREA_COLLAPSED_PREFIX) && localStorage.getItem(k) === "true") {
        collapsed.add(k.slice(PER_AREA_COLLAPSED_PREFIX.length));
      }
    }
    setCollapsedAreas(collapsed);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(HIDE_ALL_KEY, String(hideAllProjects));
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
        if (typeof window !== "undefined") localStorage.removeItem(PER_AREA_COLLAPSED_PREFIX + id);
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

  // Trunk + junctions stay neutral cyan (they belong to the whole tree, not
  // any one area), but bumped from 40% → 70% opacity and 1.25 → 1.75 stroke
  // so the backbone reads at a glance instead of fading into the canvas.
  const trunkColor = "color-mix(in oklch, var(--hud-cyan) 70%, transparent)";

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Top control bar — pinned at the top of the tree section so the
          view controls live in their own band, separate from the tree
          itself. Mono "VIEW" eyebrow on the left grounds the bar as a
          chrome strip; pills on the right. Hairline border below the bar
          gives it just enough separation from the canvas without becoming
          a card. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--deck-line)] px-2 pb-3">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--deck-ink-dull)]">
          View
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <TogglePill
            active={!hideAllProjects}
            onClick={() => setHideAllProjects((v) => !v)}
            label={hideAllProjects ? "Show projects" : "Hide projects"}
            title={
              hideAllProjects ? "Show all project sub-branches" : "Hide all project sub-branches"
            }
          />
          <TogglePill
            active={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            label={showArchived ? "Hiding archived" : "Show archived"}
            title={
              showArchived ? "Hide archived projects" : "Include archived projects in the tree"
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
            stroke={trunkColor}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        ) : null}

        {/* Per-row junctions — one horizontal segment per wrapped row, drawn
            separately from the per-area paths so animated dots don't
            double-travel along the junction. */}
        {junctionLines.map((j) => (
          <line
            key={`junction-${j.x1}-${j.x2}-${j.y}`}
            x1={j.x1}
            y1={j.y}
            x2={j.x2}
            y2={j.y}
            stroke={trunkColor}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        ))}

        {paths.map((p, i) => {
          const accent = pickNodeColor(p.id);
          const stroke = `color-mix(in oklch, ${accent} 75%, transparent)`;
          return (
            <g key={p.id}>
              <path
                id={`feed-path-${p.id}`}
                d={p.d}
                fill="none"
                stroke={stroke}
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              {reducedMotion ? null : (
                <>
                  <circle r="4" fill={accent} filter="url(#feed-glow)" opacity="0.85">
                    <animateMotion
                      dur="2.6s"
                      repeatCount="indefinite"
                      begin={`${(i * 0.35).toFixed(2)}s`}
                    >
                      <mpath href={`#feed-path-${p.id}`} />
                    </animateMotion>
                  </circle>
                  <circle r="1.75" fill={accent}>
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
          );
        })}

        {/* Vertex dots — solid filled circles at the top of every area card
            where its branch terminates. Outer halo + inner nucleus reads as
            a "node" in graph-theory sense, so the tree visualises actual
            graph vertices instead of just lines disappearing into cards. */}
        {cardVertices.map((v) => {
          const accent = pickNodeColor(v.id);
          return (
            <g key={`vertex-${v.id}`}>
              <circle
                cx={v.cx}
                cy={v.cy}
                r="6"
                fill={accent}
                opacity="0.18"
                filter="url(#feed-glow)"
              />
              <circle
                cx={v.cx}
                cy={v.cy}
                r="3.25"
                fill="var(--canvas)"
                stroke={accent}
                strokeWidth="1.5"
              />
            </g>
          );
        })}
      </svg>

      {/* Root — just the avatar. Strict pixel width AND height on both the
          wrapper AND the <img> defends against any global rule that might
          stretch <img> elements (which was happening; the user reported the
          PFP filling the page). The ambient cyan pulse is a sibling span,
          not a parent — keeps the photo's bounding box untouched. */}
      <div className="relative z-10 flex justify-center pt-1 pb-1">
        <div
          ref={rootRef}
          className="relative shrink-0 overflow-hidden rounded-2xl border border-[var(--edge-hud)] bg-[var(--surface-raised)]"
          style={{
            width: 72,
            height: 72,
            boxShadow:
              "0 0 0 1px color-mix(in oklch, var(--hud-cyan) 40%, transparent), 0 0 22px color-mix(in oklch, var(--hud-cyan) 18%, transparent)",
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 rounded-2xl",
              !reducedMotion && "animate-pulse"
            )}
            style={{
              boxShadow: "0 0 0 4px color-mix(in oklch, var(--hud-cyan) 8%, transparent)",
            }}
          />
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
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border",
        "font-mono text-[10px] uppercase tracking-[0.08em] cursor-pointer-always",
        "transition-colors duration-150 ease-out",
        active
          ? "border-[var(--deck-line)] bg-[var(--deck-selected)] text-[var(--deck-ink)]"
          : "border-transparent text-[var(--deck-ink-dull)] hover:text-[var(--deck-ink)] hover:border-[var(--deck-line)]",
        "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
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
const TICK_TOP = 11;
const TICK_WIDTH = 14;

function AreaBranch({
  area,
  setRef,
  collapsed,
  onToggleCollapse,
  showArchived,
}: {
  area: SidebarArea;
  setRef: (el: HTMLAnchorElement | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  showArchived: boolean;
}) {
  // Server fetches the full set (active + archived) so we can flip the
  // archived view without a round-trip. Filter here based on toggle.
  const visibleProjects = showArchived
    ? area.projects
    : area.projects.filter((p) => p.archivedAt === null);
  const activeCount = area.projects.filter((p) => p.archivedAt === null).length;
  const archivedCount = area.projects.length - activeCount;
  const previewProjects = visibleProjects.slice(0, 6);
  const hiddenCount = visibleProjects.length - previewProjects.length;
  const lineColor = "color-mix(in oklch, var(--edge-hud) 70%, transparent)";

  return (
    <div className="flex w-full max-w-[240px] min-w-0 shrink-0 flex-col items-stretch">
      <div className="relative">
        <Link
          ref={setRef}
          href={`/areas/${area.id}`}
          className={cn(
            "group relative flex flex-col gap-1 rounded-xl px-4 py-3 pr-9",
            // Glassier tile — translucent surface + backdrop blur. Reads the
            // --glass-* knobs so /lifeos (under .lifeos-glass) runs frostier
            // than /areas, both glassier than the old solid fill.
            "border border-[var(--deck-line)] bg-[var(--deck-panel)]",
            "hover:border-[var(--deck-accent-faint)] hover:bg-[var(--deck-hover)]",
            "transition-colors [transition-duration:var(--dur-hover)] ease-out cursor-pointer-always",
            "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          )}
        >
          <div className="flex items-baseline gap-2">
            {area.emoji ? (
              <span className="text-base leading-none" aria-hidden="true">
                {area.emoji}
              </span>
            ) : null}
            <span className="font-serif text-base font-semibold text-[var(--ink)] truncate">
              {area.name}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {activeCount} project{activeCount === 1 ? "" : "s"}
            {showArchived && archivedCount > 0 ? (
              <span className="ml-1 text-[var(--ink-muted)]/70">· {archivedCount} archived</span>
            ) : null}
          </span>
        </Link>
        {/* Per-area collapse toggle. Lives OUTSIDE the parent <Link> so the
            click doesn't navigate to the area page. Positioned absolutely
            in the card's top-right corner so it doesn't disturb the card's
            content flow. */}
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
            "absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-md",
            "text-[var(--ink-muted)] hover:text-[var(--ink)]",
            "border border-transparent hover:border-[var(--edge)] hover:bg-[var(--surface)]",
            "transition-colors [transition-duration:var(--dur-hover)] ease-out cursor-pointer-always",
            "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          )}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Sub-branches — hidden when the per-area chevron is collapsed OR
          the global "Hide projects" is on. When hidden we render NOTHING
          (no empty space) so the area cards collapse vertically and the
          tree feels responsive to the control.

          Geometry inside the visible branch:
            1. A short vertical STEM dropping from the spine origin down.
            2. A vertical SPINE down the left side of the project list at
               the same x as the stem.
            3. A horizontal TICK leaving the spine to each leaf row. The
               LEAF (icon + label) sits to the RIGHT of where the tick
               ENDS — earlier the tick spanned UNDER the icon, producing a
               cyan line that looked like a strikethrough on the glyph. */}
      {collapsed ? null : previewProjects.length > 0 ? (
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute left-3 -top-px w-px"
            style={{ height: STEM_DROP, background: lineColor }}
          />
          <ul className="flex flex-col gap-1.5 pl-3 relative" style={{ marginTop: STEM_DROP - 2 }}>
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
                <li
                  key={p.id}
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
                      "flex items-center gap-1.5 py-1 px-1.5 -ml-1.5 rounded-md",
                      "font-serif text-[13px]",
                      "hover:bg-[var(--deck-hover)] transition-colors [transition-duration:var(--dur-hover)]",
                      "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                      isArchived ? "text-[var(--ink-muted)] italic" : "text-[var(--ink)]"
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
                </li>
              );
            })}
            {hiddenCount > 0 ? (
              <li className="relative" style={{ paddingLeft: TICK_WIDTH + 12 }}>
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
                  className="inline-flex rounded-sm py-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                >
                  + {hiddenCount} more
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <div className="relative">
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
        </div>
      )}
    </div>
  );
}

function EmptyAreas() {
  return (
    <div className="rounded-md border border-dashed border-[var(--edge)] px-6 py-8 text-center max-w-md mx-auto">
      <p className="font-serif italic text-base text-[var(--ink-muted)]">
        No areas yet. Create one from the sidebar to start branching.
      </p>
    </div>
  );
}
