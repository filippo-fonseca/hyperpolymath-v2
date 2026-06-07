/**
 * /lifeos wallpaper — warm parchment depth + paper-grain texture.
 *
 * Server-safe (no client hooks). Layered radial gradients in warm/surface
 * variables give the page a quiet depth without introducing cyan; an inline
 * SVG turbulence filter overlays ~2% paper grain via mix-blend-mode multiply.
 *
 * Confined to /lifeos: only this route renders <LifeOsWallpaper />, so it
 * unmounts on navigation to /tasks, /captures, etc. No global wrapper.
 *
 * Positioned `absolute` (not `fixed`) so the wallpaper paints inside the
 * route's <main> element and never paints over the persistent sidebar.
 *
 * Static wallpaper — no motion. If a future plan adds drift, gate via
 * useReducedMotion or @media (prefers-reduced-motion: reduce).
 */
export function LifeOsWallpaper() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Solid floor — canvas color so the wallpaper has a base layer even if
          the gradient stack fails to composite. */}
      <div
        className="absolute inset-0"
        style={{ background: "var(--canvas)" }}
      />

      {/* Layered radial gradients — warm parchment with faint depth. Alphas
          tuned conservatively so the wallpaper reads as atmosphere, not as a
          decorative sunset. NO cyan introduced here. */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 20% 15%, color-mix(in oklch, var(--ink-amber) 5%, transparent) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 85%, color-mix(in oklch, var(--surface-raised) 60%, transparent) 0%, transparent 75%),
            radial-gradient(ellipse 70% 60% at 50% 50%, color-mix(in oklch, var(--surface) 35%, transparent) 0%, transparent 80%)
          `,
        }}
      />

      {/* Paper-grain overlay — SVG turbulence filter at low alpha, multiplied
          into the layers below for a soft fiber texture. Final visible
          intensity ~2%. */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{ mixBlendMode: "multiply", opacity: 0.5 }}
      >
        <filter id="lifeos-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            stitchTiles="stitch"
          />
          <feColorMatrix
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#lifeos-grain)" />
      </svg>
    </div>
  );
}

export default LifeOsWallpaper;
