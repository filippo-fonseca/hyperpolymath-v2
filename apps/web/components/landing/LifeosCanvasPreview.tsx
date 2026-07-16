/**
 * LifeosCanvasPreview — twin illustrative artifact for the §07 surface
 * section: shows what the LifeOS canvas actually contains by demoing the
 * two most distinctive surfaces side-by-side.
 *
 *   Left  : Areas tree — Notion-style nested hierarchy, the spine of the
 *           whole app. Every page on every surface descends from this.
 *   Right : Knowledge Graph — a force-directed map of how areas, projects,
 *           tasks, and captures connect. Pure illustrative SVG (no real
 *           data) sized to match the tree card.
 *
 * Sits inside SurfaceSection, right under the LifeOS paragraph + surface
 * roll-call. Matches the section's max-w-[920px] container, neumorphic
 * card register, journal typography.
 */

const TREE: Array<{ depth: number; name: string; icon?: string; muted?: boolean }> = [
  { depth: 0, name: "Academics", icon: "▾" },
  { depth: 1, name: "ANTH 2480 · Renaissance Thought", icon: "▸" },
  { depth: 1, name: "BIOL 1010 · Molecular Bio", icon: "▾" },
  { depth: 2, name: "Tasks", muted: true },
  { depth: 2, name: "Captures", muted: true },
  { depth: 1, name: "CHEM 1140 · Organic II", icon: "▸" },
  { depth: 0, name: "Running", icon: "▾" },
  { depth: 1, name: "Marathon block", icon: "▸" },
  { depth: 1, name: "Training journal", muted: true },
  { depth: 0, name: "Music", icon: "▸" },
  { depth: 0, name: "Writing", icon: "▸" },
  { depth: 0, name: "Inbox", icon: "▸" },
];

export function LifeosCanvasPreview() {
  return (
    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Areas Tree ─────────────────────────────────────────────── */}
      <figure
        className="rounded-[14px] bg-[var(--sd-box)] border border-[var(--sd-line)] overflow-hidden flex flex-col"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.06) inset",
        }}
      >
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--sd-line)] bg-[var(--sd-input)]">
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--sd-ink-faint)]">
            Areas
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--sd-ink-faint)] opacity-60">
            tree · live
          </span>
        </header>
        <div className="p-4 font-mono text-[13px] leading-[1.9] text-[var(--sd-ink)] flex-1">
          {TREE.map((node, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${node.depth * 16}px` }}
            >
              <span
                className="inline-block w-3 text-[10px]"
                style={{ color: "var(--sd-ink-faint)" }}
              >
                {node.icon ?? "·"}
              </span>
              <span
                style={{
                  color: node.muted
                    ? "var(--sd-ink-faint)"
                    : "var(--sd-ink)",
                  fontStyle: node.muted ? "italic" : "normal",
                }}
              >
                {node.name}
              </span>
            </div>
          ))}
        </div>
        <figcaption className="px-4 py-2.5 border-t border-[var(--sd-line)] text-[13px] italic text-[var(--sd-ink-faint)]">
          Every page in the app lives somewhere on this tree.
        </figcaption>
      </figure>

      {/* ── Knowledge Graph ────────────────────────────────────────── */}
      <figure
        className="rounded-[14px] bg-[var(--sd-box)] border border-[var(--sd-line)] overflow-hidden flex flex-col"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.06) inset",
        }}
      >
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--sd-line)] bg-[var(--sd-input)]">
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--sd-ink-faint)]">
            Knowledge Graph
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--sd-ink-faint)] opacity-60">
            force-directed
          </span>
        </header>
        <div className="flex-1 relative">
          <svg
            viewBox="0 0 420 280"
            className="w-full h-full block"
            role="img"
            aria-label="Knowledge graph showing areas connected to projects, tasks, and captures"
          >
            {/* edges — drawn first so nodes sit on top */}
            <g
              stroke="var(--sd-ink)"
              strokeOpacity="0.22"
              strokeWidth="1"
              fill="none"
            >
              {/* Academics hub */}
              <line x1="140" y1="90" x2="60" y2="50" />
              <line x1="140" y1="90" x2="220" y2="55" />
              <line x1="140" y1="90" x2="240" y2="135" />
              <line x1="140" y1="90" x2="80" y2="170" />
              {/* Running hub */}
              <line x1="300" y1="200" x2="240" y2="135" />
              <line x1="300" y1="200" x2="370" y2="170" />
              <line x1="300" y1="200" x2="340" y2="250" />
              <line x1="300" y1="200" x2="230" y2="240" />
              {/* cross-area link */}
              <line
                x1="240"
                y1="135"
                x2="300"
                y2="200"
                strokeDasharray="3 4"
                strokeOpacity="0.35"
              />
              <line
                x1="140"
                y1="90"
                x2="300"
                y2="200"
                strokeDasharray="2 6"
                strokeOpacity="0.18"
              />
            </g>

            {/* nodes */}
            {/* Academics — area hub */}
            <g>
              <circle cx="140" cy="90" r="14" fill="var(--sd-ink)" />
              <text
                x="140"
                y="74"
                textAnchor="middle"
                fontFamily="ui-monospace, Menlo, monospace"
                fontSize="10"
                fill="var(--sd-ink)"
              >
                Academics
              </text>
            </g>
            {/* Running — area hub */}
            <g>
              <circle cx="300" cy="200" r="14" fill="var(--sd-ink)" />
              <text
                x="300"
                y="184"
                textAnchor="middle"
                fontFamily="ui-monospace, Menlo, monospace"
                fontSize="10"
                fill="var(--sd-ink)"
              >
                Running
              </text>
            </g>

            {/* projects + leaves */}
            {[
              { cx: 60, cy: 50, label: "ANTH 2480", kind: "project" },
              { cx: 220, cy: 55, label: "BIOL 1010", kind: "project" },
              { cx: 240, cy: 135, label: "CHEM 1140", kind: "project" },
              { cx: 80, cy: 170, label: "pset · thu", kind: "task" },
              { cx: 370, cy: 170, label: "marathon", kind: "project" },
              { cx: 340, cy: 250, label: "long run", kind: "task" },
              { cx: 230, cy: 240, label: "#idea", kind: "capture" },
            ].map((n, i) => (
              <g key={i}>
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={n.kind === "project" ? 9 : 6}
                  fill={
                    n.kind === "project"
                      ? "var(--sd-box)"
                      : n.kind === "capture"
                      ? "var(--sd-input)"
                      : "var(--sd-ink-faint)"
                  }
                  stroke="var(--sd-ink)"
                  strokeOpacity={n.kind === "task" ? 0 : 0.7}
                  strokeWidth="1"
                />
                <text
                  x={n.cx}
                  y={n.cy + (n.cy > 200 ? 22 : -14)}
                  textAnchor="middle"
                  fontFamily="ui-monospace, Menlo, monospace"
                  fontSize="9"
                  fill="var(--sd-ink-faint)"
                >
                  {n.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <figcaption className="px-4 py-2.5 border-t border-[var(--sd-line)] text-[13px] italic text-[var(--sd-ink-faint)]">
          Areas, projects, tasks, captures, and the lines between them.
        </figcaption>
      </figure>
    </div>
  );
}
