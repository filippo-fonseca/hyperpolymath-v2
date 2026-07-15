"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Reads the live `--sd-*` custom properties off `<html>` so every swatch
 * shows the value the cascade actually resolved, not a transcribed literal.
 * Re-reads on theme change since next-themes toggles `.dark` on `<html>`
 * and the sd ladder remaps per scope (D11).
 */
function useComputedTokens(names: readonly string[]) {
  const { resolvedTheme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const name of names) {
        next[name] = styles.getPropertyValue(name).trim();
      }
      setValues(next);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, names]);

  return values;
}

function Swatch({ name, value }: { name: string; value?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-12 rounded-[8px] border"
        style={{ background: `var(${name})`, borderColor: "var(--sd-line)" }}
        aria-hidden="true"
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-[var(--sd-ink-dull)]">{name}</span>
        <span className="font-mono text-[10px] text-[var(--sd-ink-faint)] truncate max-w-[9rem]">
          {value || "…"}
        </span>
      </div>
    </div>
  );
}

const SURFACE_TOKENS = [
  "--sd-app",
  "--sd-box",
  "--sd-dark-box",
  "--sd-darker-box",
  "--sd-sidebar",
  "--sd-input",
  "--sd-line",
  "--sd-divider",
  "--sd-hover",
  "--sd-selected",
  "--sd-selected-item",
  "--sd-active",
] as const;

const INK_TOKENS = ["--sd-ink", "--sd-ink-dull", "--sd-ink-faint"] as const;

const ACCENT_TOKENS = ["--sd-accent", "--sd-accent-faint", "--sd-accent-deep"] as const;

/** Functional hues. Dots and 15%-alpha tinted chips only, never chrome. */
const FUNCTIONAL_TOKENS = ["--ink-sage", "--ink-amber", "--ink-coral"] as const;

export function TokenLadder() {
  const surfaces = useComputedTokens(SURFACE_TOKENS);
  const inks = useComputedTokens(INK_TOKENS);
  const accents = useComputedTokens(ACCENT_TOKENS);
  const functional = useComputedTokens(FUNCTIONAL_TOKENS);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] mb-3">
          Surfaces
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
          {SURFACE_TOKENS.map((name) => (
            <Swatch key={name} name={name} value={surfaces[name]} />
          ))}
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] mb-3">
          Ink
        </p>
        <div className="grid grid-cols-3 gap-4">
          {INK_TOKENS.map((name) => (
            <Swatch key={name} name={name} value={inks[name]} />
          ))}
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] mb-3">
          Accent (JARVIS cyan) · the only hue
        </p>
        <div className="grid grid-cols-3 gap-4">
          {ACCENT_TOKENS.map((name) => (
            <Swatch key={name} name={name} value={accents[name]} />
          ))}
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] mb-3">
          Functional inks · dots and 15% chips only, never chrome
        </p>
        <div className="grid grid-cols-3 gap-4">
          {FUNCTIONAL_TOKENS.map((name) => (
            <Swatch key={name} name={name} value={functional[name]} />
          ))}
        </div>
      </div>
    </div>
  );
}
