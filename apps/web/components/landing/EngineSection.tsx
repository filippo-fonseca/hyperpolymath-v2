import { ArrowRight } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { Reveal } from "./Reveal";
import { STRICT_TOOL_USE_FIXTURE } from "../../../../packages/jarvis-core/tests/strict-tool-use.fixture";

/**
 * §04 — The Engine (LAND-ENGINE / SC-5 / D-05).
 *
 * THE ONE MODERATE-DENSITY SECTION on the landing — earns its weight via the
 * Claude Sonnet 4.6 + Strict Tool Use paragraph and the real JSON contract
 * imported verbatim from packages/jarvis-core/tests/strict-tool-use.fixture.ts.
 *
 * sd register: the INPUT + JSON panels are card-v2 plates. The single accent
 * (JARVIS cyan) lives on the JSON card's cyan-tinted edge and its eyebrow —
 * no glow shadow (banned). JSON syntax stays single-hue: keys = ink, strings
 * = ink-dull, numbers/null/bool = the cyan accent, punctuation = ink-faint.
 *
 * Source-of-truth: STRICT_TOOL_USE_FIXTURE imported VERBATIM from the
 * jarvis-core test fixture (relative path — fixture is a test artifact, not a
 * package public API; the single import keeps the package boundary clean).
 */

export function EngineSection() {
  return (
    <Reveal as="section" className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 06 · THE ENGINE" />
      <h2 className="mt-2 font-semibold text-[32px] leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
        Claude Sonnet 4.6, with a contract.
      </h2>
      <p className="mt-4 text-[18px] leading-[1.6] text-[var(--sd-ink)]">
        Most agents are just an LLM with a prompt taped on top. They drift,
        they hallucinate fields, they cheerfully invent tools that
        don&rsquo;t exist. That&rsquo;s tolerable for a demo. It isn&rsquo;t
        tolerable for the thing that organizes the rest of your life.
      </p>
      <p className="mt-4 text-[18px] leading-[1.6] text-[var(--sd-ink)]">
        So I built JARVIS the other way around. The schema is the source of
        truth, and the model is constrained to it. Claude Sonnet 4.6 with
        Strict Tool Use literally cannot emit a malformed action, because
        the contract is enforced at generation time rather than validated
        after the fact. One sentence in, N typed JSON tool calls out, each
        a different shape. The router stays small because the primitives
        stay small, and the whole pipeline still fits in my head.
      </p>

      {/* Side-by-side input + JSON */}
      <div className="mt-6 flex flex-col md:flex-row md:items-stretch md:gap-6">
        {/* Left card — INPUT */}
        <div className="md:max-w-[280px] flex-shrink-0 rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-6">
          <p className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
            INPUT
          </p>
          <p className="mt-3 italic text-[18px] leading-[1.5] text-[var(--sd-ink)]">
            {STRICT_TOOL_USE_FIXTURE.input}
          </p>
        </div>

        {/* Arrow (desktop only) */}
        <div className="hidden md:flex items-center text-[var(--sd-ink-faint)]">
          <ArrowRight size={24} aria-hidden="true" />
        </div>

        {/* Right card — STRICT-TOOL-USE JSON (cyan-bearing surface) */}
        <div
          className="md:max-w-[460px] flex-1 rounded-[14px] bg-[var(--sd-box)] p-6 overflow-x-auto custom-scrollbar mt-6 md:mt-0"
          style={{
            // The one accent surface: a cyan-tinted hairline edge (no glow).
            border:
              "1px solid color-mix(in oklch, var(--sd-accent) 30%, var(--sd-line))",
          }}
        >
          <p
            className="font-mono text-[14px] font-medium uppercase tracking-[0.14em]"
            style={{ color: "var(--sd-accent)" }}
          >
            STRICT-TOOL-USE JSON
          </p>
          <pre className="mt-3 font-mono font-mono-stats text-[14px] leading-[1.55] text-[var(--sd-ink)] whitespace-pre-wrap break-words">
            <JsonFormatted value={STRICT_TOOL_USE_FIXTURE.output} />
          </pre>
        </div>
      </div>

      {/* Source-of-truth note */}
      <p className="mt-4 font-mono text-[14px] text-[var(--sd-ink-faint)]">
        {"Plucked verbatim from packages/jarvis-core/tests/strict-tool-use.fixture.ts. No edits."}
      </p>
    </Reveal>
  );
}

/**
 * Manual JSON formatter with span-based syntax coloring, single-hue (sd):
 * keys --sd-ink weight 500; strings --sd-ink-dull; number/null/bool the cyan
 * --sd-accent; punctuation --sd-ink-faint.
 * Recursive — handles nested objects and arrays.
 */
function JsonFormatted({
  value,
  indent = 0,
}: {
  value: unknown;
  indent?: number;
}) {
  const pad = "  ".repeat(indent);
  const padNext = "  ".repeat(indent + 1);

  if (value === null) {
    return <span style={{ color: "var(--sd-accent)" }}>null</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span style={{ color: "var(--sd-accent)" }}>{String(value)}</span>
    );
  }
  if (typeof value === "number") {
    return <span style={{ color: "var(--sd-accent)" }}>{value}</span>;
  }
  if (typeof value === "string") {
    return (
      <span style={{ color: "var(--sd-ink-dull)" }}>
        {JSON.stringify(value)}
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span style={{ color: "var(--sd-ink-faint)" }}>[]</span>;
    }
    return (
      <>
        <span style={{ color: "var(--sd-ink-faint)" }}>{"["}</span>
        {value.map((item, i) => (
          <span key={i}>
            {"\n"}
            {padNext}
            <JsonFormatted value={item} indent={indent + 1} />
            {i < value.length - 1 && (
              <span style={{ color: "var(--sd-ink-faint)" }}>,</span>
            )}
          </span>
        ))}
        {"\n"}
        {pad}
        <span style={{ color: "var(--sd-ink-faint)" }}>{"]"}</span>
      </>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span style={{ color: "var(--sd-ink-faint)" }}>{"{}"}</span>;
    }
    return (
      <>
        <span style={{ color: "var(--sd-ink-faint)" }}>{"{"}</span>
        {entries.map(([key, val], i) => (
          <span key={key}>
            {"\n"}
            {padNext}
            <span style={{ color: "var(--sd-ink)", fontWeight: 500 }}>
              {JSON.stringify(key)}
            </span>
            <span style={{ color: "var(--sd-ink-faint)" }}>: </span>
            <JsonFormatted value={val} indent={indent + 1} />
            {i < entries.length - 1 && (
              <span style={{ color: "var(--sd-ink-faint)" }}>,</span>
            )}
          </span>
        ))}
        {"\n"}
        {pad}
        <span style={{ color: "var(--sd-ink-faint)" }}>{"}"}</span>
      </>
    );
  }
  return null;
}
