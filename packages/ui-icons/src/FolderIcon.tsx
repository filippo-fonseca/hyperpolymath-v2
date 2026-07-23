import { useId } from "react";

import { cn } from "./cn";

export type FolderIconVariant = "closed" | "open";

export function FolderIcon({
  size = 40,
  variant = "closed",
  dropTarget = false,
  className,
  title,
}: {
  size?: number;
  variant?: FolderIconVariant;
  dropTarget?: boolean;
  className?: string;
  title?: string;
}) {
  const svgId = useId().replace(/:/g, "");
  const bodyGradientId = `folder-body-${svgId}`;
  const tabGradientId = `folder-tab-${svgId}`;
  const lipGradientId = `folder-lip-${svgId}`;
  const shadowId = `folder-shadow-${svgId}`;
  const titleId = title ? `folder-icon-${svgId}` : undefined;
  const isOpen = variant === "open";

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
        <radialGradient
          id={bodyGradientId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(30 24) rotate(53) scale(54 68)"
        >
          <stop stopColor="#6079C0" />
          <stop offset="0.48" stopColor="#40568E" />
          <stop offset="1" stopColor="#263454" />
        </radialGradient>
        <linearGradient
          id={tabGradientId}
          x1="12"
          y1="14"
          x2="57"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7489C8" />
          <stop offset="0.55" stopColor="#526AA8" />
          <stop offset="1" stopColor="#33436C" />
        </linearGradient>
        <linearGradient
          id={lipGradientId}
          x1="10"
          y1="32"
          x2="70"
          y2="35"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="white" stopOpacity="0.08" />
          <stop offset="1" stopColor="white" stopOpacity="0.02" />
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

      {dropTarget ? (
        <rect
          x="5"
          y="10"
          width="70"
          height="58"
          rx="12"
          stroke="var(--sd-accent, #2599ff)"
          strokeWidth="2"
          strokeDasharray="4 4"
          fill="color-mix(in srgb, var(--sd-accent, #2599ff) 14%, transparent)"
        />
      ) : null}

      <g filter={`url(#${shadowId})`}>
        <path
          d="M12 23.5C12 19.9 14.9 17 18.5 17H31.8C34.1 17 35.2 18 36.8 19.8L40.5 24H61.5C65.1 24 68 26.9 68 30.5V35.5H12V23.5Z"
          fill={`url(#${tabGradientId})`}
        />
        <path
          d={
            isOpen
              ? "M10.5 34.5H69.5L64.6 62C64 65.3 61.2 67.5 57.9 67.5H18.1C14.8 67.5 12 65.3 11.4 62L8.4 45.2C7.4 39.7 9.8 34.5 10.5 34.5Z"
              : "M10.5 32H69.5V61.5C69.5 65.1 66.6 68 63 68H17C13.4 68 10.5 65.1 10.5 61.5V32Z"
          }
          fill={`url(#${bodyGradientId})`}
        />
        <path
          d={
            isOpen
              ? "M10.5 42C25.8 37.2 54.2 37.2 69.5 42L64.6 62C64 65.3 61.2 67.5 57.9 67.5H18.1C14.8 67.5 12 65.3 11.4 62L8.8 47.4C8.4 45.2 9 43.2 10.5 42Z"
              : "M10.5 39C25.6 35.3 54.4 35.3 69.5 39V61.5C69.5 65.1 66.6 68 63 68H17C13.4 68 10.5 65.1 10.5 61.5V39Z"
          }
          fill="hsl(225 36% 25% / 0.42)"
        />
        <path d="M13 34H67" stroke={`url(#${lipGradientId})`} strokeWidth="1" />
        <path
          d={
            isOpen
              ? "M10.7 34.5H69.2L68.3 39.5C56.5 35.7 24.2 35.5 9.7 39.6L8.8 35.5C9.2 34.8 9.8 34.5 10.7 34.5Z"
              : "M11 32.5H69V38C55.8 34.8 25.6 34.8 11 38V32.5Z"
          }
          fill="white"
          opacity="0.06"
        />
      </g>
    </svg>
  );
}
