"use client";

/**
 * StudioSkeleton — the loading state shown while the ssr:false Canvas island
 * (StudioCanvas + three/R3F) streams in.
 *
 * A paper-textured Nightwalnut void with a single CSS-pulsing candle-point at
 * center — the studio holding its breath. No three import; pure DOM + inline
 * styles on the STUDIOLO brand tokens so it renders instantly before any 3D
 * bytes arrive.
 */
export function StudioSkeleton(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#120E0B",
        // Faint vellum grain over the walnut, so the void reads as paper.
        backgroundImage:
          "radial-gradient(circle at 50% 40%, rgba(242,233,216,0.05), transparent 60%), url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: "#E8C46B",
          boxShadow: "0 0 24px 6px rgba(232,196,107,0.55)",
          animation: "studio-candle 1.8s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes studio-candle {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          span { animation: none !important; opacity: 0.7 !important; }
        }
      `}</style>
    </div>
  );
}

export default StudioSkeleton;
