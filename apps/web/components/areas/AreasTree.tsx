"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Archive } from "lucide-react";
import { AreaIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { tintFor } from "@/lib/tint";
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
 *   - Each area gets a branch off the trunk, elbowing into the top of its card.
 *   - Connectors are ORTHOGONAL with soft 6px corners so the tree reads as a
 *     tree rather than a circulatory diagram, and never pass over any text.
 *
 * Register: UI CONTRACT v2 §7. The tree is de-glowed — connectors are a flat
 * 1px --sd-line hairline, the terminals are 3px unlit accent dots, and the
 * avatar carries a hairline instead of a glow ring. No traveling pulse, no
 * blur filters, no glassmorphism: the structure carries the drawing, not light.
 *
 * Measurement: ResizeObserver on container + root + each card ref recomputes
 * path coordinates on resize, so the geometry never hard-codes an area count
 * or a card width. Card tops stay put when a card's chips expand below them,
 * so connectors never shift during a collapse.
 */

const TRUNK_DROP = 32; // px the trunk falls before reaching the junction
const BRANCH_RISE = 28; // px the branch rises off the top of each card
const ELBOW = 6; // corner radius where a branch turns down into its card

const CONNECTOR = "var(--sd-line)";
const DOT = "var(--sd-accent)";

/**
 * Orthogonal path from the trunk (x0) across to a card's center (x1), turning
 * down into the card top. The turn is rounded by ELBOW via a quadratic whose
 * control point sits on the corner, which keeps the curve tangent to both legs.
 * Degenerate cases (card sitting on the trunk, or a run shorter than the
 * radius) fall back to a straight line so we never emit a backwards arc.
 */
function elbowPath(x0: number, x1: number, y: number, yEnd: number): string {
  const run = x1 - x0;
  const drop = yEnd - y;
  const r = Math.min(ELBOW, Math.abs(run), Math.max(drop, 0));
  if (r < 1) return `M ${x0} ${y} H ${x1} V ${yEnd}`;
  const dir = run > 0 ? 1 : -1;
  return [
    `M ${x0} ${y}`,
    `H ${x1 - dir * r}`,
    `Q ${x1} ${y} ${x1} ${y + r}`,
    `V ${yEnd}`,
  ].join(" ");
}

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
        setTrunkLine(null);
        setSvgSize({ w: containerRect.width, h: containerRect.height });
        return;
      }

      // Bucket cards into rows by `top`. Cards within 8px of each other are
      // one row (absorbs sub-pixel jitter from getBoundingClientRect).
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

      // Single card: a straight drop from root to card, no elbow needed.
      if (cardCenters.length === 1) {
        const only = cardCenters[0];
        const branchEndY = Math.max(rootBottom + TRUNK_DROP, only.top - 2);
        setPaths([
          { id: only.id, d: `M ${rootCx} ${rootBottom} V ${branchEndY}` },
        ]);
        setCardVertices([{ id: only.id, cx: rootCx, cy: branchEndY }]);
        setTrunkLine(null);
        setSvgSize({ w: containerRect.width, h: containerRect.height });
        return;
      }

      // One branch per card, elbowing off the trunk at its row's junction Y.
      // The union of these paths draws the horizontal junction run, so no
      // separate junction segment is needed.
      const nextPaths: { id: string; d: string }[] = [];
      const nextVertices: { id: string; cx: number; cy: number }[] = [];
      let lastJunctionY = rootBottom + TRUNK_DROP;
      for (const row of rows) {
        const rowJunctionY = row[0].top - BRANCH_RISE;
        for (const c of row) {
          const branchEndY = Math.max(rowJunctionY, c.top - 2);
          nextPaths.push({
            id: c.id,
            d: elbowPath(rootCx, c.cx, rowJunctionY, branchEndY),
          });
          nextVertices.push({ id: c.id, cx: c.cx, cy: branchEndY });
        }
        lastJunctionY = rowJunctionY;
      }

      // One continuous trunk spine from rootBottom down to the LAST row's
      // junction Y. It passes through every intermediate junction (they all
      // share x=rootCx), visually unifying multi-row layouts.
      setPaths(nextPaths);
      setCardVertices(nextVertices);
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
      {/* Controls strip — craft chip row on a hairline. The eyebrow grounds the
          band as chrome; the toggles read as the same chips the app uses. */}
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--sd-line)_60%,transparent)] px-2 pb-3">
        <span className="text-micro text-[var(--ink-faint)]">View</span>
        <div className="flex items-center gap-2">
          <ChipButton
            active={!hideAllProjects}
            onClick={() => setHideAllProjects((v) => !v)}
            label={hideAllProjects ? "Show projects" : "Hide projects"}
            title={
              hideAllProjects
                ? "Show all project sub-branches"
                : "Hide all project sub-branches"
            }
          />
          <ChipButton
            active={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            label={showArchived ? "Hiding archived" : "Show archived"}
            title={
              showArchived
                ? "Hide archived projects"
                : "Include archived projects in the tree"
            }
            icon={<Archive size={13} />}
          />
        </div>
      </div>

      <svg
        aria-hidden="true"
        width={svgSize.w}
        height={svgSize.h}
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
        className="pointer-events-none absolute inset-0"
        style={{ overflow: "visible" }}
      >
        {/* Trunk spine — one continuous vertical from root through every row's
            junction, so multi-row layouts get a single visual backbone. */}
        {trunkLine ? (
          <line
            x1={trunkLine.x}
            y1={trunkLine.y1}
            x2={trunkLine.x}
            y2={trunkLine.y2}
            stroke={CONNECTOR}
            strokeWidth="1"
          />
        ) : null}

        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill="none"
            stroke={CONNECTOR}
            strokeWidth="1"
          />
        ))}

        {/* Junction dots — 3px unlit accent terminals where each branch meets
            its card. The lone accent moment in the drawing; no halo, no blur. */}
        {cardVertices.map((v) => (
          <circle
            key={`dot-${v.id}`}
            cx={v.cx}
            cy={v.cy}
            r="1.5"
            fill={DOT}
            opacity="0.7"
          />
        ))}
      </svg>

      {/* Root — the avatar, 56px, on the craft card plate (elevation belongs to
          content). Strict pixel width AND height on the wrapper AND the <img>
          defends against any global rule that would stretch <img> elements. */}
      <div className="relative z-10 flex justify-center pt-1 pb-1">
        <div
          ref={rootRef}
          className="craft-card relative shrink-0 overflow-hidden"
          style={{ width: 56, height: 56 }}
        >
          {rootAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rootAvatarUrl}
              alt={rootLabel}
              width={56}
              height={56}
              style={{
                width: 56,
                height: 56,
                maxWidth: 56,
                maxHeight: 56,
                display: "block",
                objectFit: "cover",
              }}
            />
          ) : (
            <span
              className="flex items-center justify-center text-title text-[var(--ink-muted)]"
              style={{ width: 56, height: 56 }}
            >
              {rootInitial}
            </span>
          )}
        </div>
      </div>

      {/* Spacer matches TRUNK_DROP so the trunk has room to draw without
          colliding with the avatar above or the area row below. */}
      <div style={{ height: TRUNK_DROP }} aria-hidden="true" />

      {/* Area row. Wraps onto multiple rows when width is exceeded — the
          measurement pass buckets cards into rows and elbows each branch off
          the shared trunk. */}
      <div className="relative z-10">
        <div
          className="flex flex-wrap items-start justify-center gap-x-8 gap-y-10 px-4 pb-4"
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

function ChipButton({
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
      className="craft-chip shrink-0 cursor-pointer-always"
    >
      {icon}
      {label}
    </button>
  );
}

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
  const activeCount = area.projects.filter((p) => p.archivedAt === null).length;
  const archivedCount = area.projects.length - activeCount;
  const previewProjects = visibleProjects.slice(0, 6);
  const hiddenCount = visibleProjects.length - previewProjects.length;

  // Collapse choreography — height:auto reveal on the campaign easing, with
  // chips staggered in beneath it. AnimatePresence initial={false} suppresses
  // the enter animation on first paint (no mount flash), and every duration
  // collapses to 0 under reduced motion.
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
      transition: {
        duration: reducedMotion ? 0 : 0.16,
        ease: "easeOut" as const,
      },
    },
  };

  return (
    <div className="flex w-[200px] shrink-0 flex-col items-stretch">
      <div className="relative">
        {/* Mini entity card, craft v2: the raised white card carries the
            elevation, hover moves shadow + border only, and the area's one
            colored element is its tinted icon plate (identity, not
            decoration). */}
        <Link
          ref={setRef}
          href={`/areas/${area.id}`}
          className={cn(
            "craft-card craft-card-hover group relative flex flex-col gap-2 px-3 py-3 pr-8",
            "cursor-pointer-always focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            tintFor(area.id),
          )}
        >
          <div className="flex items-center gap-2.5">
            {/* 28px icon backplate. Keeps the user's chosen emoji where set;
                defaults to the dimensional AreaIcon (never drop user data). */}
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-bg)] text-[var(--tint-ink)] text-meta leading-none"
            >
              {area.emoji ? area.emoji : <AreaIcon size={18} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-meta font-semibold text-[var(--ink)]">
              {area.name}
            </span>
          </div>
          <span className="text-micro text-[var(--ink-faint)]">
            {activeCount} project{activeCount === 1 ? "" : "s"}
            {showArchived && archivedCount > 0 ? (
              <span className="ml-1">· {archivedCount} archived</span>
            ) : null}
          </span>
        </Link>
        {/* Per-area collapse toggle. Lives OUTSIDE the parent <Link> so the
            click doesn't navigate to the area page. */}
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
            "absolute top-2.5 right-2 inline-flex size-6 items-center justify-center rounded-lg",
            "text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
            "cursor-pointer-always transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          )}
        >
          <ChevronDown
            size={14}
            className="transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          />
        </button>
      </div>

      {/* Child projects — chip grammar (§7). Renders NOTHING when collapsed so
          the card packs tight; card tops stay fixed while chips grow below, so
          the SVG connectors never shift. */}
      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            key="branch"
            variants={container}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="overflow-hidden"
          >
            {previewProjects.length > 0 ? (
              <ul className="flex flex-wrap gap-2 pt-2.5">
                {previewProjects.map((p) => (
                  <motion.li key={p.id} variants={leaf}>
                    <Link
                      href={`/projects/${p.id}`}
                      className="craft-chip max-w-full cursor-pointer-always"
                    >
                      <DynamicIcon
                        name={p.icon}
                        size={13}
                        strokeWidth={1.5}
                        className="shrink-0"
                      />
                      <span className="truncate">{p.name}</span>
                      {p.archivedAt !== null ? (
                        <Archive
                          size={11}
                          className="shrink-0 text-[var(--ink-faint)]"
                          aria-label="archived"
                        />
                      ) : null}
                    </Link>
                  </motion.li>
                ))}
                {hiddenCount > 0 ? (
                  <motion.li variants={leaf}>
                    <Link
                      href={`/areas/${area.id}`}
                      className="craft-chip cursor-pointer-always"
                    >
                      +{hiddenCount} more
                    </Link>
                  </motion.li>
                ) : null}
              </ul>
            ) : (
              <p className="pt-2.5 text-micro text-[var(--ink-faint)]">No projects yet</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The one empty state (SDC-1 §2.10) — no dashed box, no local ladder. */
function EmptyAreas() {
  return (
    <EmptyState
      icon={<AreaIcon size={40} />}
      title="No areas yet"
      description="Create one from the sidebar to start branching."
    />
  );
}
