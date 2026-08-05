"use client";

/**
 * CaptureGraphView — the graph half of /captures.
 *
 * Plots the user's 500 most recent captures and the four ways they connect
 * (shared tag, same subject, direct mention, same project — S10). Each layer
 * toggles independently; selecting a capture dims everything it doesn't touch
 * so a single thread can be read out of the web; clicking opens the same detail
 * panel the list view uses.
 *
 * react-force-graph-2d touches `window` at import time, so it loads via
 * next/dynamic with ssr:false — legal here because this file is a Client
 * Component (Next 16 forbids ssr:false only inside Server Components). The
 * force config, ResizeObserver sizing, and link-endpoint helpers follow the
 * shipped /graph explorer; the ink does not (see capture-graph-style.ts).
 */

import { getCaptureGraph } from "@/app/actions/capture-graph";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import {
  type CaptureGraph,
  type CaptureGraphEdge,
  type CaptureGraphEdgeKind,
  type CaptureGraphNode,
  DEFAULT_VISIBLE_EDGE_KINDS,
} from "@/lib/captures/graph-edges";
import { tableKey } from "@/lib/realtime/query-keys";
import { useQuery } from "@tanstack/react-query";
import { forceCollide } from "d3-force";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDGE_KIND_META,
  EDGE_KIND_ORDER,
  type GraphInk,
  edgeInk,
  edgeWidth,
  nodeRadius,
  resolveGraphInk,
} from "./capture-graph-style";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-micro text-[var(--sd-ink-faint)]">
      drawing the web…
    </div>
  ),
});

interface Props {
  userId: string;
  /** Opens the capture in the shared detail panel. */
  onSelectCapture: (captureId: string) => void;
}

interface GNode extends CaptureGraphNode {
  degree: number;
  x?: number;
  y?: number;
}

const tile =
  "rounded-[12px] border border-[var(--sd-line)] " +
  "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]";

export function CaptureGraphView({ userId, onSelectCapture }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/suspicious/noExplicitAny: force-graph ref has no exported type
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [visibleKinds, setVisibleKinds] = useState<Set<CaptureGraphEdgeKind>>(
    () => new Set(DEFAULT_VISIBLE_EDGE_KINDS)
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The layout settles wherever the simulation lands, which is rarely centred
  // in the viewport. Frame it once per dataset — and only once, or every
  // re-settle would yank the canvas back from wherever the user panned to.
  const hasFramedRef = useRef(false);
  const [ink, setInk] = useState<GraphInk | null>(null);
  const { resolvedTheme } = useTheme();

  // Keyed under the captures prefix, so the captures / captures_hashtags /
  // entity_references subscriptions already mounted by CapturesClient fan out
  // to it — the graph restructures live as captures are written or referenced.
  const graphQuery = useQuery<CaptureGraph>({
    queryKey: [...tableKey("captures", userId), "graph"] as const,
    queryFn: getCaptureGraph,
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas holds no reference back to the CSS, so the tokens are re-read
  // whenever the register flips. resolvedTheme is the trigger, not an input —
  // the values come from getComputedStyle.
  //
  // The read is deferred a frame (as app/design/TokenSwatches.tsx does):
  // next-themes toggles `.dark` on <html>, and reading synchronously in the
  // effect resolves against the outgoing register, which leaves a paper-white
  // canvas sitting in dark mode.
  // biome-ignore lint/correctness/useExhaustiveDependencies: theme flip is the signal to re-read
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = wrapRef.current;
      if (!el) return;
      setInk(resolveGraphInk(el));
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  const graph = graphQuery.data;

  const { graphData, nodeById, adjacency } = useMemo(() => {
    const visibleEdges = (graph?.edges ?? []).filter((e) => visibleKinds.has(e.kind));

    const degree = new Map<string, number>();
    for (const e of visibleEdges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const nodes: GNode[] = (graph?.nodes ?? []).map((n) => ({
      ...n,
      degree: degree.get(n.id) ?? 0,
    }));

    const byId = new Map(nodes.map((n) => [n.id, n]));

    const adj = new Map<string, Set<string>>();
    for (const e of visibleEdges) {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)?.add(e.target);
      adj.get(e.target)?.add(e.source);
    }

    // force-graph mutates link objects in place (string ids become node refs),
    // so hand it copies — the query cache must stay untouched.
    const links = visibleEdges.map((e) => ({ ...e }));

    return { graphData: { nodes, links }, nodeById: byId, adjacency: adj };
  }, [graph, visibleKinds]);

  // Ego mode: the focused capture plus its direct neighbours stay lit.
  const litIds = useMemo(() => {
    if (!focusedId) return null;
    const set = new Set<string>([focusedId]);
    for (const id of adjacency.get(focusedId) ?? []) set.add(id);
    return set;
  }, [focusedId, adjacency]);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const hits = new Set<string>();
    for (const n of graphData.nodes) {
      if (n.label.toLowerCase().includes(q) || n.hashtags.some((h) => h.includes(q))) {
        hits.add(n.id);
      }
    }
    return hits;
  }, [search, graphData.nodes]);

  // Same shape as /graph: the default engine runs charge + link only, so a
  // collision force keyed on render radius stops hubs crumpling their
  // neighbours into an overlapping ring. Waits on the ref via rAF because the
  // dynamic chunk mounts asynchronously. graphData/dims are re-run triggers
  // (the force config must be reapplied after either changes), not values read
  // during the effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reapply forces when the data or canvas changes
  useEffect(() => {
    let raf = 0;
    hasFramedRef.current = false;
    // biome-ignore lint/suspicious/noExplicitAny: force-graph node accessor is untyped
    const collideRadius = (n: any) => nodeRadius(n.degree ?? 0) + 4;
    const apply = () => {
      const fg = fgRef.current;
      if (!fg) {
        raf = requestAnimationFrame(apply);
        return;
      }
      fg.d3Force("collide", forceCollide(collideRadius));
      fg.d3Force("charge")?.strength(-90);
      fg.d3Force("link")?.distance(52);
      fg.d3ReheatSimulation();
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [graphData, dims]);

  const focusOn = useCallback((id: string) => {
    setFocusedId(id);
    const fg = fgRef.current;
    if (!fg) return;
    // Node coordinates only exist once the engine has ticked.
    // biome-ignore lint/suspicious/noExplicitAny: untyped graph data
    const n = (fg.graphData?.().nodes as any[] | undefined)?.find((x) => x.id === id);
    if (n && typeof n.x === "number") {
      fg.centerAt(n.x, n.y, 600);
      fg.zoom(2.4, 600);
    }
  }, []);

  function toggleKind(kind: CaptureGraphEdgeKind) {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const focused = focusedId ? nodeById.get(focusedId) : null;
  const edgeCounts = useMemo(() => {
    const counts = new Map<CaptureGraphEdgeKind, number>();
    for (const e of graph?.edges ?? []) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return counts;
  }, [graph]);

  const droppedTotal = useMemo(
    () => Object.values(graph?.meta.droppedEdges ?? {}).reduce((s, n) => s + (n ?? 0), 0),
    [graph]
  );

  // -- Paint --------------------------------------------------------------

  const paintNode = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      if (!ink) return;
      const n = node as GNode;
      const r = nodeRadius(n.degree);
      const dimmed = litIds ? !litIds.has(n.id) : false;
      const isFocus = n.id === focusedId;
      const isHit = searchHits?.has(n.id) ?? false;

      ctx.globalAlpha = dimmed ? 0.18 : 1;

      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = isFocus ? ink.accent : n.degree === 0 ? ink.nodeIsolated : ink.node;
      ctx.fill();
      ctx.lineWidth = 0.6 / scale;
      ctx.strokeStyle = ink.nodeRing;
      ctx.stroke();

      if (isHit && !isFocus) {
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r + 2.5, 0, 2 * Math.PI);
        ctx.lineWidth = 1.2 / scale;
        ctx.strokeStyle = ink.highlight;
        ctx.stroke();
      }

      // Labels are the fastest way to a cluttered canvas, so they appear only
      // once zoomed in, or for the capture actually under inspection.
      const showLabel = isFocus || isHit || scale > 2.6;
      if (showLabel && !dimmed) {
        const fontSize = Math.min(11 / scale, 4.5);
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = ink.label;
        const text = n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label;
        ctx.fillText(text, n.x ?? 0, (n.y ?? 0) + r + 1.5 / scale);
      }

      ctx.globalAlpha = 1;
    },
    [ink, litIds, focusedId, searchHits]
  );

  const paintLink = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
    (link: any, ctx: CanvasRenderingContext2D) => {
      if (!ink) return;
      const edge = link as CaptureGraphEdge;
      const s = link.source;
      const t = link.target;
      if (typeof s !== "object" || typeof t !== "object") return;

      const touchesFocus =
        focusedId != null && (String(s.id) === focusedId || String(t.id) === focusedId);
      const dimmed = litIds ? !(litIds.has(String(s.id)) && litIds.has(String(t.id))) : false;

      const meta = EDGE_KIND_META[edge.kind];
      const alpha = touchesFocus ? meta.alphaFocus : meta.alpha;

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.1 : 1;
      ctx.setLineDash(meta.dash);
      ctx.strokeStyle = edgeInk(ink, alpha);
      ctx.lineWidth = edgeWidth(edge.kind, edge.weight, touchesFocus);
      ctx.beginPath();
      ctx.moveTo(s.x ?? 0, s.y ?? 0);
      ctx.lineTo(t.x ?? 0, t.y ?? 0);
      ctx.stroke();
      ctx.restore();
    },
    [ink, focusedId, litIds]
  );

  // -- Render -------------------------------------------------------------

  const isEmpty = !graphQuery.isLoading && (graph?.nodes.length ?? 0) === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Layers + search */}
      <div className={`${tile} flex flex-wrap items-center gap-2 bg-[var(--sd-box)] px-4 py-2.5`}>
        <span className="mr-1 text-micro text-[var(--sd-ink-faint)]">
          layers
        </span>
        {EDGE_KIND_ORDER.map((kind) => {
          const on = visibleKinds.has(kind);
          const meta = EDGE_KIND_META[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              title={meta.description}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-micro transition-opacity ${
                on
                  ? "border-[var(--sd-line)] text-[var(--sd-ink)]"
                  : "border-transparent text-[var(--sd-ink-faint)] opacity-50"
              }`}
            >
              <EdgeSwatch kind={kind} />
              {meta.label}
              <span className="text-[var(--sd-ink-faint)]">{edgeCounts.get(kind) ?? 0}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {droppedTotal > 0 && (
            <span
              className="font-mono text-micro text-[var(--sd-ink-faint)]"
              title="The densest layers are capped so the canvas stays readable. Heaviest links are kept."
            >
              {droppedTotal} link{droppedTotal === 1 ? "" : "s"} hidden
            </span>
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a capture…"
            aria-label="Find a capture in the graph"
            className="h-7 w-[200px] text-meta"
          />
        </div>
      </div>

      {/* Canvas */}
      <div className={`${tile} relative min-h-0 flex-1 overflow-hidden bg-[var(--sd-app)]`}>
        <div ref={wrapRef} className="relative h-full min-h-0 w-full">
          {isEmpty ? (
            <div className="grid h-full place-items-center p-6">
              <EmptyState
                heading="Nothing to connect yet."
                body="This is the same inbox, drawn as a web: captures link when they share a #tag, when they @-mention the same task or person, when one @-mentions the other, or when they're filed under the same project. Capture a few thoughts and the shape shows up."
              />
            </div>
          ) : (
            dims.w > 0 &&
            ink && (
              <ForceGraph2D
                ref={fgRef}
                width={dims.w}
                height={dims.h}
                graphData={graphData}
                backgroundColor={ink.surface}
                nodeCanvasObject={paintNode}
                // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
                nodeLabel={(n: any) => (n as GNode).label}
                nodePointerAreaPaint={(
                  // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
                  node: any,
                  color: string,
                  ctx: CanvasRenderingContext2D
                ) => {
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.arc(
                    node.x ?? 0,
                    node.y ?? 0,
                    nodeRadius((node as GNode).degree) + 2,
                    0,
                    2 * Math.PI
                  );
                  ctx.fill();
                }}
                linkCanvasObject={paintLink}
                // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
                linkLabel={(l: any) => {
                  const e = l as CaptureGraphEdge;
                  const meta = EDGE_KIND_META[e.kind];
                  return e.label ? `${meta.label} · ${e.label}` : meta.label;
                }}
                // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
                onNodeClick={(n: any) => focusOn(String(n.id))}
                onBackgroundClick={() => setFocusedId(null)}
                onEngineStop={() => {
                  if (hasFramedRef.current) return;
                  hasFramedRef.current = true;
                  fgRef.current?.zoomToFit(500, 48);
                }}
                warmupTicks={40}
                cooldownTicks={120}
              />
            )
          )}

          {!isEmpty && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)]/85 px-2.5 py-1 font-mono text-micro text-[var(--sd-ink-faint)]">
              scroll to zoom · drag to pan · click a capture to focus
            </div>
          )}
        </div>

        {/* Focused capture — ego controls + the way into the detail panel */}
        {focused && (
          <aside
            className={`absolute right-3 top-3 w-[288px] ${tile} bg-[var(--sd-box)] p-4 shadow-sm`}
          >
            <p className="text-micro text-[var(--sd-ink-faint)]">
              focused · {adjacency.get(focused.id)?.size ?? 0} connected
            </p>
            <p className="mt-2 text-meta leading-snug text-[var(--sd-ink)]">{focused.label}</p>
            {focused.hashtags.length > 0 && (
              <p className="mt-2 font-mono text-micro text-[var(--sd-ink-faint)]">
                {focused.hashtags.map((h) => `#${h}`).join(" ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectCapture(focused.id)}
                className="rounded-[8px] border border-[var(--sd-line)] px-2.5 py-1 font-mono text-micro text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]"
              >
                open capture
              </button>
              <button
                type="button"
                onClick={() => setFocusedId(null)}
                className="rounded-[8px] px-2.5 py-1 font-mono text-micro text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]"
              >
                clear focus
              </button>
            </div>
            {(adjacency.get(focused.id)?.size ?? 0) > 0 && (
              <div className="mt-3 border-t border-[var(--sd-line)] pt-2">
                <p className="text-micro text-[var(--sd-ink-faint)]">
                  expand from here
                </p>
                <ul className="mt-1.5 max-h-[168px] space-y-0.5 overflow-y-auto">
                  {[...(adjacency.get(focused.id) ?? [])].map((id) => {
                    const n = nodeById.get(id);
                    if (!n) return null;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => focusOn(id)}
                          className="w-full truncate rounded px-1.5 py-1 text-left text-micro text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
                        >
                          {n.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Tiny line swatch mirroring how the kind is actually stroked on the canvas. */
function EdgeSwatch({ kind }: { kind: CaptureGraphEdgeKind }) {
  const meta = EDGE_KIND_META[kind];
  const dash = meta.dash.length ? meta.dash.join(" ") : undefined;
  return (
    <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden="true" className="shrink-0">
      <title>{meta.label}</title>
      <line
        x1="0"
        y1="2"
        x2="14"
        y2="2"
        stroke="currentColor"
        strokeWidth={meta.width + 0.4}
        strokeDasharray={dash}
        opacity={Math.min(1, meta.alpha + 0.35)}
      />
    </svg>
  );
}
