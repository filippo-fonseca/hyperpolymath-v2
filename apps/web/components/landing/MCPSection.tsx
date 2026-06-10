import { Plug, ScrollText, Brain } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * §06.5 — THE MCP SERVER.
 *
 * Hyperpolymath ships a Model Context Protocol server at /api/mcp.
 * Any compliant client (Claude Desktop, ChatGPT desktop, custom
 * agents) can mount it, authenticate with a bearer token issued
 * from /settings/mcp-tokens, and read everything the system knows
 * about your life — tasks, captures, projects, areas, calendar
 * events, habits, training — from one source.
 *
 * This section advertises that surface because it changes what a
 * "personal life-OS" can mean: not a closed app, but a context layer
 * any AI agent can plug into.
 */

const EXPOSED: ReadonlyArray<{ icon: typeof Plug; label: string; hint: string }> = [
  {
    icon: Brain,
    label: "Tasks · Captures · Areas · Projects",
    hint: "Every item you've created, with its hierarchy and links intact.",
  },
  {
    icon: ScrollText,
    label: "Calendar · Habits · Training",
    hint: "What's happening today, the streaks, the training block.",
  },
  {
    icon: Plug,
    label: "Memory · Relationships · Personal Graph",
    hint: "The graph between everything — who, what, when, why.",
  },
];

export function MCPSection() {
  return (
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 06.5 · THE MCP SERVER" />

      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        Your life, available to any LLM.
      </h2>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Hyperpolymath ships a{" "}
        <span
          className="font-mono text-[15px] px-1.5 py-0.5 rounded"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--edge)",
          }}
        >
          Model Context Protocol
        </span>{" "}
        server at <code className="font-mono">/api/mcp</code>. Any
        compliant client &mdash; Claude Desktop, ChatGPT desktop, a
        custom agent &mdash; can mount it, authenticate with a bearer
        token issued from settings, and read everything the system
        knows about your life from a single source.
      </p>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        No exporting. No copy-paste. No bespoke integration per tool.
        The MCP server <em>is</em> the integration.
      </p>

      {/* What it exposes */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
        {EXPOSED.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-4"
              style={{
                boxShadow:
                  "0 1px 0 color-mix(in oklch, white 65%, transparent) inset",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[var(--surface-raised)] border border-[var(--edge)] text-[var(--ink)]"
                  aria-hidden="true"
                >
                  <Icon size={13} strokeWidth={1.8} />
                </span>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink)]">
                  Exposed
                </p>
              </div>
              <p className="font-serif text-[15px] leading-[1.45] text-[var(--ink)]">
                {row.label}
              </p>
              <p className="mt-1 font-serif text-[13px] leading-[1.45] text-[var(--ink-muted)]">
                {row.hint}
              </p>
            </div>
          );
        })}
      </div>

      {/* Config snippet — looks like the Claude Desktop / MCP config */}
      <div
        className="mt-8 rounded-lg overflow-hidden border"
        style={{
          borderColor: "var(--edge-hud)",
          boxShadow: "var(--glow-hud-subtle)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{
            background: "var(--surface-raised)",
            borderColor: "var(--edge-hud)",
          }}
        >
          <span
            className="font-mono text-[11px] tracking-[0.14em] uppercase"
            style={{ color: "var(--hud-cyan-light)" }}
          >
            ~/.config/claude_desktop_config.json
          </span>
          <span
            className="font-mono text-[10px] tracking-[0.14em] uppercase opacity-60"
            style={{ color: "var(--ink-muted)" }}
          >
            Example
          </span>
        </div>
        <pre
          className="px-5 py-4 m-0 font-mono text-[13px] leading-[1.6] overflow-x-auto custom-scrollbar"
          style={{ background: "var(--surface)", color: "var(--ink)" }}
        >
{`{
  "mcpServers": {
    "hyperpolymath": {
      "url": "https://hyperpolymath.com/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_MCP_TOKEN>"
      }
    }
  }
}`}
        </pre>
      </div>

      <p className="mt-6 font-mono text-[14px] text-[var(--ink-muted)]">
        One token. One endpoint. Any model that speaks MCP can now
        reason about everything in your life.
      </p>
    </section>
  );
}
