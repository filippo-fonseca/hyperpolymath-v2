import { cn } from "@/lib/utils";
import { useId } from "react";

export type PageIconKind = "note" | "daily" | "doc";

const accentByKind: Record<PageIconKind, string> = {
  note: "var(--sd-accent, #2599ff)",
  daily: "var(--ink-amber)",
  doc: "var(--ink-sage)",
};

export function PageIcon({
  size = 40,
  kind = "note",
  className,
  title,
}: {
  size?: number;
  kind?: PageIconKind;
  className?: string;
  title?: string;
}) {
  const svgId = useId().replace(/:/g, "");
  const bodyGradientId = `page-body-${svgId}`;
  const foldGradientId = `page-fold-${svgId}`;
  const shadowId = `page-shadow-${svgId}`;
  const titleId = title ? `page-icon-${svgId}` : undefined;
  const accent = accentByKind[kind];

  return (
    <svg
      role={title ? "img" : "presentation"}
      aria-labelledby={titleId}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      className={cn("shrink-0 overflow-visible", className)}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <defs>
        <linearGradient
          id={bodyGradientId}
          x1="18"
          y1="10"
          x2="62"
          y2="70"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="hsl(235 15% 98%)" />
          <stop offset="1" stopColor="hsl(235 15% 84%)" />
        </linearGradient>
        <linearGradient
          id={foldGradientId}
          x1="50"
          y1="12"
          x2="65"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="hsl(235 15% 100%)" />
          <stop offset="1" stopColor="hsl(235 15% 76%)" />
        </linearGradient>
        <filter
          id={shadowId}
          x="-25%"
          y="-25%"
          width="150%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="5"
            floodColor="var(--sd-icon-shadow, hsl(235 15% 0%))"
            floodOpacity="var(--sd-icon-shadow-opacity, 0.18)"
          />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        <path
          d="M18 16C18 12.7 20.7 10 24 10H50L64 24V64C64 67.3 61.3 70 58 70H24C20.7 70 18 67.3 18 64V16Z"
          fill={`url(#${bodyGradientId})`}
        />
        <path d="M50 10V21C50 24.3 52.7 27 56 27H64L50 10Z" fill={`url(#${foldGradientId})`} />
        <path
          d="M51 11V21C51 23.8 53.2 26 56 26H63"
          stroke="hsl(235 15% 56% / 0.32)"
          strokeWidth="1"
        />
        <rect x="39" y="48" width="23" height="18" rx="5" fill={accent} />
        <path
          d="M45 54H56M45 59H53"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M27 32H53"
          stroke="hsl(235 15% 45% / 0.34)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M27 40H56"
          stroke="hsl(235 15% 45% / 0.24)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M27 48H47" stroke="hsl(235 15% 45% / 0.2)" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M24 11H49"
          stroke="white"
          strokeOpacity="0.8"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
