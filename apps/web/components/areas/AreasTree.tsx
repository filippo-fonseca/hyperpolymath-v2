"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
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

export function AreasTree({
  areas,
  rootAvatarUrl,
  rootInitial,
  rootLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [junctionLine, setJunctionLine] = useState<{
    x1: number;
    x2: number;
    y: number;
    rootX: number;
    rootY: number;
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

      // Junction Y sits TRUNK_DROP below the root. If only one card we don't
      // need a horizontal junction — connector goes straight down.
      const junctionY = rootBottom + TRUNK_DROP;

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
        setJunctionLine(null);
        setSvgSize({ w: containerRect.width, h: containerRect.height });
        return;
      }

      const minX = Math.min(...cardCenters.map((c) => c.cx));
      const maxX = Math.max(...cardCenters.map((c) => c.cx));

      const next: { id: string; d: string }[] = [];
      for (const c of cardCenters) {
        // Orthogonal path: down the trunk → across the junction → down the
        // branch to BRANCH_RISE above the card's top edge. We stop BRANCH_RISE
        // above the card so the dot fades into the card surface rather than
        // visually crashing into it.
        const branchEndY = Math.max(junctionY, c.top - 2);
        const d =
          cardCenters.length === 1
            ? // Single area: no horizontal segment needed.
              `M ${rootCx} ${rootBottom} V ${branchEndY}`
            : // Multiple areas: trunk → junction → branch.
              `M ${rootCx} ${rootBottom} V ${junctionY} H ${c.cx} V ${branchEndY}`;
        next.push({ id: c.id, d });
      }

      setPaths(next);
      setJunctionLine(
        cardCenters.length > 1
          ? { x1: minX, x2: maxX, y: junctionY, rootX: rootCx, rootY: rootBottom }
          : null,
      );
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

  const lineColor = "color-mix(in oklch, var(--hud-cyan) 40%, transparent)";

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

        {/* Junction line drawn once, separate from the per-area paths so the
            animated dots don't double-travel along it. */}
        {junctionLine ? (
          <line
            x1={junctionLine.x1}
            y1={junctionLine.y}
            x2={junctionLine.x2}
            y2={junctionLine.y}
            stroke={lineColor}
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        ) : null}

        {paths.map((p, i) => (
          <g key={p.id}>
            <path
              id={`feed-path-${p.id}`}
              d={p.d}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.25"
              strokeLinecap="round"
            />
            <circle
              r="4"
              fill="var(--hud-cyan-light)"
              filter="url(#feed-glow)"
              opacity="0.85"
            >
              <animateMotion
                dur="2.6s"
                repeatCount="indefinite"
                begin={`${(i * 0.35).toFixed(2)}s`}
              >
                <mpath href={`#feed-path-${p.id}`} />
              </animateMotion>
            </circle>
            <circle r="1.75" fill="var(--hud-cyan-light)">
              <animateMotion
                dur="2.6s"
                repeatCount="indefinite"
                begin={`${(i * 0.35).toFixed(2)}s`}
              >
                <mpath href={`#feed-path-${p.id}`} />
              </animateMotion>
            </circle>
          </g>
        ))}
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
            className="pointer-events-none absolute inset-0 rounded-2xl animate-pulse"
            style={{
              boxShadow:
                "0 0 0 4px color-mix(in oklch, var(--hud-cyan) 8%, transparent)",
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

      {/* Area row. nowrap + horizontal scroll keeps the tree shape intact for
          many areas instead of wrapping (which would break the single-row
          junction concept). At small counts it centers. */}
      <div className="relative z-10 overflow-x-auto">
        <div
          className={cn(
            "flex items-start gap-8 px-4 pb-4 mx-auto",
            "min-w-min w-fit",
          )}
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
  const activeCount = area.projects.filter(
    (p) => p.archivedAt === null,
  ).length;
  const archivedCount = area.projects.length - activeCount;
  const previewProjects = visibleProjects.slice(0, 6);
  const hiddenCount = visibleProjects.length - previewProjects.length;
  const lineColor = "color-mix(in oklch, var(--edge-hud) 70%, transparent)";

  return (
    <div className="flex flex-col items-stretch w-[240px] shrink-0">
      <div className="relative">
        <Link
          ref={setRef}
          href={`/areas/${area.id}`}
          className={cn(
            "group relative flex flex-col gap-1 rounded-xl px-4 py-3 pr-9",
            "border border-[var(--edge)] bg-[var(--surface)]",
            "hover:border-[var(--edge-hud)] hover:bg-[var(--surface-raised)]",
            "transition-colors duration-150 ease-out cursor-pointer-always",
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
              <span className="ml-1 text-[var(--ink-muted)]/70">
                · {archivedCount} archived
              </span>
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
            "transition-colors duration-150 ease-out cursor-pointer-always",
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
                      "hover:bg-[var(--surface)] transition-colors duration-100",
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
                </li>
              );
            })}
            {hiddenCount > 0 ? (
              <li
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
                  className="inline-flex font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors py-1"
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
