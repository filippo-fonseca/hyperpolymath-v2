import { Plug, ScrollText, Brain } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { Reveal } from "./Reveal";

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
    <Reveal as="section" className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 06.5 · THE MCP SERVER" />

      <h2 className="mt-2 font-semibold text-headline leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
        Your life, available to any LLM.
      </h2>

      <p className="mt-4 text-lead leading-[1.6] text-[var(--sd-ink)]">
        Hyperpolymath ships a{" "}
        <span
          className="font-mono text-subtitle px-1.5 py-0.5 rounded"
          style={{
            background: "var(--sd-input)",
            border: "1px solid var(--sd-line)",
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

      <p className="mt-4 text-lead leading-[1.6] text-[var(--sd-ink)]">
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
              className="rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-[var(--sd-input)] border border-[var(--sd-line)] text-[var(--sd-accent)]"
                  aria-hidden="true"
                >
                  <Icon size={13} strokeWidth={1.8} />
                </span>
                <p className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
                  Exposed
                </p>
              </div>
              <p className="text-subtitle leading-[1.45] text-[var(--sd-ink)]">
                {row.label}
              </p>
              <p className="mt-1 text-meta leading-[1.45] text-[var(--sd-ink-faint)]">
                {row.hint}
              </p>
            </div>
          );
        })}
      </div>

      {/* Config snippet — looks like the Claude Desktop / MCP config */}
      <div
        className="mt-8 rounded-[12px] overflow-hidden border"
        style={{
          // Single accent surface: cyan-tinted hairline, no glow (banned).
          borderColor:
            "color-mix(in oklch, var(--sd-accent) 30%, var(--sd-line))",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{
            background: "var(--sd-input)",
            borderColor:
              "color-mix(in oklch, var(--sd-accent) 30%, var(--sd-line))",
          }}
        >
          <span
            className="font-mono text-micro tracking-[0.14em] uppercase"
            style={{ color: "var(--sd-accent)" }}
          >
            ~/.config/claude_desktop_config.json
          </span>
          <span
            className="font-mono text-micro tracking-[0.14em] uppercase opacity-60"
            style={{ color: "var(--sd-ink-faint)" }}
          >
            Example
          </span>
        </div>
        <pre
          className="px-5 py-4 m-0 font-mono text-meta leading-[1.6] overflow-x-auto custom-scrollbar"
          style={{ background: "var(--sd-dark-box)", color: "var(--sd-ink)" }}
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

      <p className="mt-6 font-mono text-body text-[var(--sd-ink-faint)]">
        One token. One endpoint. Any model that speaks MCP can now
        reason about everything in your life.
      </p>
    </Reveal>
  );
}
