"use client";

import { PALETTE_LABELS, PALETTE_TOKENS, type PaletteToken, paletteVars } from "@/lib/ui/palette";
import { cn } from "@/lib/utils";
import { Ban, Check } from "lucide-react";

/**
 * A single row of palette swatches plus a "no colour" reset.
 *
 * Small enough to live inline in a context menu (colour is a glance-and-click
 * decision, so burying it behind a submenu costs more than the row does), and
 * used anywhere a folder, cover, or card takes a colour.
 */
export function ColorSwatchRow({
  value,
  onChange,
  size = 16,
  className,
}: {
  value: PaletteToken | null;
  onChange: (next: PaletteToken | null) => void;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {PALETTE_TOKENS.map((token) => {
        const vars = paletteVars(token);
        const selected = value === token;
        return (
          <button
            key={token}
            type="button"
            onClick={() => onChange(token)}
            title={PALETTE_LABELS[token]}
            aria-label={PALETTE_LABELS[token]}
            aria-pressed={selected}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform duration-[120ms] hover:scale-110"
            style={{
              width: size,
              height: size,
              background: vars.bg,
              border: `1.5px solid ${vars.edge}`,
              color: vars.ink,
            }}
          >
            {selected ? <Check size={Math.round(size * 0.6)} strokeWidth={3} /> : null}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(null)}
        title="No colour"
        aria-label="No colour"
        aria-pressed={value === null}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed transition-transform duration-[120ms] hover:scale-110",
          value === null
            ? "border-[var(--ink-muted)] text-[var(--ink-muted)]"
            : "border-[var(--edge-strong)] text-[var(--ink-faint)]"
        )}
        style={{ width: size, height: size }}
      >
        <Ban size={Math.round(size * 0.55)} strokeWidth={2} />
      </button>
    </div>
  );
}
