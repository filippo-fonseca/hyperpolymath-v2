"use client";

/**
 * GraphExplorer — client island for /graph.
 *
 * Renders the personal context snapshot as an interactive force-directed
 * "spider web": nodes coloured by type, relational edges (project_in_area,
 * task_in_project, capture_in_project) plus synthetic capture↔#tag links so
 * loosely-filed captures still cluster. Hover for a label, click to open a
 * detail panel that lists the node's fields + its connected nodes (each
 * clickable to walk the graph). Per-type filter chips toggle visibility.
 *
 * react-force-graph-2d touches `window` at import time, so it is loaded via
 * next/dynamic with ssr:false (legal here because this file is a Client
 * Component — Next 16 forbids ssr:false only inside Server Components).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { forceCollide } from "d3-force";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
      loading graph…
    </div>
  ),
});

type RawNode = Record<string, unknown>;
type RawEdge = Record<string, unknown>;

interface Meta {
  totalNodes: number;
  totalEdges: number;
  excludedNoExportCount: number;
  nodeCounts: Record<string, number>;
}

interface Props {
  snapshotDate: string;
  schemaVersion: number;
  generatedAt: string | null;
  nodes: RawNode[];
  edges: RawEdge[];
  meta: Meta;
  mcpTokenActive: boolean;
}

const TYPE_META: Record<string, { color: string; val: number; label: string }> = {
  area: { color: "#f59e0b", val: 11, label: "Areas" },
  project: { color: "#22d3ee", val: 7, label: "Projects" },
  task: { color: "#818cf8", val: 2.5, label: "Tasks" },
  capture: { color: "#34d399", val: 2.5, label: "Captures" },
  training_activity: { color: "#fb7185", val: 4, label: "Training" },
  habit: { color: "#a78bfa", val: 4, label: "Habits" },
  jarvis_fact: { color: "#f87171", val: 4, label: "Facts" },
  tag: { color: "#94a3b8", val: 2, label: "Tags" },
};

function nodeName(n: RawNode): string {
  const t = String(n.type);
  if (t === "task") return String(n.title ?? "Untitled task");
  if (t === "capture" || t === "jarvis_fact") {
    const s = String(n.text ?? "");
    return s.length > 80 ? `${s.slice(0, 80)}…` : s || "(empty)";
  }
  if (t === "training_activity") return String(n.kind ?? "Activity");
  if (t === "tag") return `#${String(n.name ?? "")}`;
  return String(n.name ?? "Untitled");
}

function typeLabel(t: string): string {
  return TYPE_META[t]?.label?.replace(/s$/, "") ?? t;
}

interface GNode {
  id: string;
  type: string;
  color: string;
  val: number;
  name: string;
  raw: RawNode;
  x?: number;
  y?: number;
}
interface GLink {
  source: string;
  target: string;
  type: string;
  srcType: string;
  tgtType: string;
}

// Shared glassy pill chrome — mirrors PROFILE pill in settings nav.
// Glass translucent surface + backdrop-blur + inset cyan glow + soft outer halo.
const tile =
  "rounded-xl " +
  "glass-tile " +
  "";

export function GraphExplorer({
  snapshotDate,
  schemaVersion,
  generatedAt,
  nodes,
  edges,
  meta,
  mcpTokenActive,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/suspicious/noExplicitAny: force-graph ref has no exported type
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build graph data once. Synthetic #tag nodes connect captures that share a
  // hashtag so the web has structure even where projects aren't assigned.
  const { graphData, nodeById, adjacency } = useMemo(() => {
    const gnodes: GNode[] = [];
    const byId = new Map<string, GNode>();
    for (const n of nodes) {
      const id = String(n.id);
      const type = String(n.type);
      const m = TYPE_META[type] ?? { color: "#94a3b8", val: 3, label: type };
      const gn: GNode = { id, type, color: m.color, val: m.val, name: nodeName(n), raw: n };
      gnodes.push(gn);
      byId.set(id, gn);
    }

    const glinks: GLink[] = [];
    const pushLink = (source: string, target: string, type: string) => {
      const s = byId.get(source);
      const t = byId.get(target);
      if (!s || !t) return;
      glinks.push({ source, target, type, srcType: s.type, tgtType: t.type });
    };

    for (const e of edges) {
      const from = e.from ? String(e.from) : null;
      const to = e.to ? String(e.to) : null;
      if (from && to) pushLink(from, to, String(e.type));
    }

    // capture → #tag synthetic web
    for (const n of nodes) {
      if (String(n.type) !== "capture") continue;
      const tags = Array.isArray(n.tags) ? (n.tags as unknown[]) : [];
      for (const raw of tags) {
        const tag = String(raw);
        const tid = `tag:${tag}`;
        if (!byId.has(tid)) {
          const gn: GNode = {
            id: tid,
            type: "tag",
            color: TYPE_META.tag.color,
            val: TYPE_META.tag.val,
            name: `#${tag}`,
            raw: { type: "tag", name: tag },
          };
          gnodes.push(gn);
          byId.set(tid, gn);
        }
        pushLink(String(n.id), tid, "capture_tagged");
      }
    }

    const adj = new Map<string, Set<string>>();
    for (const l of glinks) {
      (adj.get(l.source) ?? adj.set(l.source, new Set()).get(l.source)!).add(l.target);
      (adj.get(l.target) ?? adj.set(l.target, new Set()).get(l.target)!).add(l.source);
    }

    return { graphData: { nodes: gnodes, links: glinks }, nodeById: byId, adjacency: adj };
  }, [nodes, edges]);

  // Imperative force config — the default engine runs only charge + link, so
  // high-degree nodes (e.g. an Area with 20+ child Projects) crumple their
  // children into an overlapping ring. A collision force keyed on each node's
  // render radius (nodeRelSize·√val + padding) deterministically prevents that.
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const fg = fgRef.current;
      // ForceGraph2D mounts asynchronously (next/dynamic chunk), so this effect
      // can run before the graph instance exists. Wait for the ref via rAF so
      // the force config is never silently dropped on first load.
      if (!fg) {
        raf = requestAnimationFrame(apply);
        return;
      }
      // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
      fg.d3Force("collide", forceCollide((n: any) => 4 * Math.sqrt(n.val) + 5));
      fg.d3Force("charge")?.strength(-110);
      fg.d3Force("link")?.distance(48);
      fg.d3ReheatSimulation();
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [graphData, dims]);

  const presentTypes = useMemo(() => {
    const s = new Set<string>();
    for (const n of graphData.nodes) s.add(n.type);
    return [...s].sort((a, b) => (TYPE_META[b]?.val ?? 0) - (TYPE_META[a]?.val ?? 0));
  }, [graphData]);

  function toggleType(t: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const selected = selectedId ? nodeById.get(selectedId) : null;
  const neighbors = useMemo(() => {
    if (!selectedId) return [] as GNode[];
    const ids = adjacency.get(selectedId);
    if (!ids) return [];
    return [...ids]
      .map((id) => nodeById.get(id))
      .filter((n): n is GNode => Boolean(n) && !hidden.has((n as GNode).type));
  }, [selectedId, adjacency, nodeById, hidden]);

  // biome-ignore lint/suspicious/noExplicitAny: node objects are mutated by force-graph
  function focusNode(node: any) {
    setSelectedId(String(node.id));
    if (fgRef.current && typeof node.x === "number") {
      fgRef.current.centerAt(node.x, node.y, 600);
      fgRef.current.zoom(2.2, 600);
    }
  }

  function selectById(id: string) {
    setSelectedId(id);
    const n = nodeById.get(id) as GNode | undefined;
    if (n && fgRef.current && typeof n.x === "number") {
      fgRef.current.centerAt(n.x, n.y, 600);
      fgRef.current.zoom(2.2, 600);
    }
  }

  return (
    <main className="relative flex h-full min-h-0 flex-col gap-3 bg-[var(--canvas)] p-4 text-[var(--ink)]">
      {/* MCP / snapshot header */}
      <header
        className={`${tile} flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] px-5 py-3`}
      >
        <div className="min-w-0">
          <h1 className="font-serif text-xl font-semibold">Knowledge graph</h1>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--ink-muted)]">
            {meta.totalNodes} nodes · {meta.totalEdges} edges · snapshot {snapshotDate} · schema v{schemaVersion}
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span
            className={
              mcpTokenActive
                ? "rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-400"
                : "rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-400"
            }
          >
            {mcpTokenActive ? "MCP token active" : "no MCP token"}
          </span>
          <Link
            href="/settings/mcp-tokens"
            className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            manage MCP →
          </Link>
        </div>
      </header>

      {/* Filter legend */}
      <div
        className={`${tile} flex flex-wrap items-center gap-2 bg-[var(--surface)] px-5 py-2.5`}
      >
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          show
        </span>
        {presentTypes.map((t) => {
          const on = !hidden.has(t);
          const m = TYPE_META[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-opacity ${
                on
                  ? "border-[var(--edge)] text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-muted)] opacity-50"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: m?.color ?? "#94a3b8" }}
              />
              {m?.label ?? t} · {meta.nodeCounts[t] ?? (t === "tag" ? "" : 0)}
            </button>
          );
        })}
      </div>

      {/* Graph canvas + detail panel */}
      <div
        className={`${tile} relative flex min-h-0 flex-1 overflow-hidden bg-[#0a0c10]`}
      >
        <div ref={wrapRef} className="relative min-h-0 flex-1 bg-[#0a0c10]">
          {dims.w > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={dims.w}
              height={dims.h}
              graphData={graphData}
              backgroundColor="#0a0c10"
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              nodeVal={(n: any) => (n.id === selectedId ? n.val * 2.2 : n.val)}
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              nodeColor={(n: any) => (n.id === selectedId ? "#ffffff" : n.color)}
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              nodeLabel={(n: any) => `${typeLabel(n.type)} · ${n.name}`}
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              nodeVisibility={(n: any) => !hidden.has(n.type)}
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              linkVisibility={(l: any) => !hidden.has(l.srcType) && !hidden.has(l.tgtType)}
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              linkColor={(l: any) =>
                selectedId && (srcId(l) === selectedId || tgtId(l) === selectedId)
                  ? "rgba(255,255,255,0.55)"
                  : "rgba(148,163,184,0.40)"
              }
              // biome-ignore lint/suspicious/noExplicitAny: untyped accessor args
              linkWidth={(l: any) =>
                selectedId && (srcId(l) === selectedId || tgtId(l) === selectedId) ? 1.4 : 1.0
              }
              nodeRelSize={4}
              warmupTicks={40}
              cooldownTicks={120}
              onNodeClick={focusNode}
              onBackgroundClick={() => setSelectedId(null)}
            />
          )}

          {/* hint pill */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/5 bg-black/40 px-2.5 py-1 font-mono text-[10px] text-white/60 shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
            scroll to zoom · drag to pan · click a node to inspect
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-[color-mix(in_oklch,var(--edge)_70%,transparent)] bg-[var(--surface)] p-5 shadow-[inset_6px_0_18px_color-mix(in_oklch,var(--ink)_6%,transparent),inset_0_1px_0_color-mix(in_oklch,white_50%,transparent)]">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: selected.color }}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                {typeLabel(selected.type)}
              </span>
            </div>
            <h2 className="mt-2 font-serif text-lg leading-snug text-[var(--ink)]">
              {selected.name}
            </h2>

            <dl className="mt-4 space-y-1.5 font-mono text-[11px]">
              {Object.entries(selected.raw)
                .filter(([k]) => !["id", "type", "name", "title", "text"].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-[var(--ink-muted)]">{k}</dt>
                    <dd className="truncate text-right text-[var(--ink)]">
                      {Array.isArray(v) ? v.join(", ") || "—" : String(v ?? "—")}
                    </dd>
                  </div>
                ))}
            </dl>

            <div className="mt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                connected · {neighbors.length}
              </p>
              <ul className="mt-2 space-y-1">
                {neighbors.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => selectById(n.id)}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--surface-raised)]"
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: n.color }}
                      />
                      <span className="truncate font-serif text-[13px] text-[var(--ink)]">
                        {n.name}
                      </span>
                    </button>
                  </li>
                ))}
                {neighbors.length === 0 && (
                  <li className="px-1.5 font-serif text-[13px] text-[var(--ink-muted)]">
                    No connections in the current view.
                  </li>
                )}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

// Link endpoints become node objects after the force engine runs; before that
// they're string ids. Resolve either form to a string id.
// biome-ignore lint/suspicious/noExplicitAny: untyped force-graph link
function srcId(l: any): string {
  return typeof l.source === "object" ? String(l.source.id) : String(l.source);
}
// biome-ignore lint/suspicious/noExplicitAny: untyped force-graph link
function tgtId(l: any): string {
  return typeof l.target === "object" ? String(l.target.id) : String(l.target);
}
