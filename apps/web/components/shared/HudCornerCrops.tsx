"use client";

/**
 * Phase 6.1 Plan 06.1-01: HudCornerCrops shared primitive (UI-SPEC §1b, §6e).
 *
 * Four SVG L-bracket corner crops drawn at --edge-hud. Purely visual
 * chrome: aria-hidden + pointer-events-none, never intercepts focus.
 *
 * The `.hud-corner-crop` class (declared in globals.css) drives the
 * always-on 6s breathing animation (opacity 0.45 → 0.6 → 0.45) via the
 * --ease-in-out-circ token. Pass `breathing={false}` to render static
 * crops (used by Plan 03 chart panels where motion is unwanted).
 *
 * SVG-based (not CSS pseudo-elements) so a single component owns all
 * four corners without ::before/::after collisions on the parent.
 *
 * Consumed by Plan 02 (JARVIS Console chrome) and Plan 03 (/insights
 * chart panels + /health viewport corners + /settings/memory).
 */
interface HudCornerCropsProps {
  /** L-bracket arm length in px. Default 12. */
  size?: number;
  /** Wrapper class. Default fills parent absolutely. */
  className?: string;
  /** If false, renders static crops (no .hud-corner-crop animation). Default true. */
  breathing?: boolean;
}

export function HudCornerCrops({
  size = 12,
  className = "absolute inset-0 pointer-events-none",
  breathing = true,
}: HudCornerCropsProps) {
  const cropClass = breathing ? "hud-corner-crop" : "";

  return (
    <div className={className} aria-hidden="true">
      {/* Top-left */}
      <svg
        className={`absolute top-0 left-0 ${cropClass}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        <line x1="0" y1="0" x2={size} y2="0" stroke="var(--edge-hud)" strokeWidth="1" />
        <line x1="0" y1="0" x2="0" y2={size} stroke="var(--edge-hud)" strokeWidth="1" />
      </svg>
      {/* Top-right */}
      <svg
        className={`absolute top-0 right-0 ${cropClass}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        <line x1="0" y1="0" x2={size} y2="0" stroke="var(--edge-hud)" strokeWidth="1" />
        <line x1={size} y1="0" x2={size} y2={size} stroke="var(--edge-hud)" strokeWidth="1" />
      </svg>
      {/* Bottom-left */}
      <svg
        className={`absolute bottom-0 left-0 ${cropClass}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        <line x1="0" y1={size} x2={size} y2={size} stroke="var(--edge-hud)" strokeWidth="1" />
        <line x1="0" y1="0" x2="0" y2={size} stroke="var(--edge-hud)" strokeWidth="1" />
      </svg>
      {/* Bottom-right */}
      <svg
        className={`absolute bottom-0 right-0 ${cropClass}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        <line x1="0" y1={size} x2={size} y2={size} stroke="var(--edge-hud)" strokeWidth="1" />
        <line x1={size} y1="0" x2={size} y2={size} stroke="var(--edge-hud)" strokeWidth="1" />
      </svg>
    </div>
  );
}
