import { KIWI_PATH } from "@/lib/branding/kiwi-path";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  className?: string;
}

/**
 * The kiwi-bird mark — the same silhouette the /branding page ships as the
 * canonical "Kiwi mark" asset, drawn from the shared KIWI_PATH geometry.
 *
 * The fill is `currentColor` rather than a token so the mark inherits whatever
 * ink its lockup sits in. That matches the brand canon: /branding renders the
 * mark in `theme.accent`, which resolves to the foreground ink in both the
 * paper and dark themes (#1a1815 / #f6f3ec), never to cyan. The lockup is
 * monochrome — cyan here would read as instrumentation, not identity.
 */
export function KiwiMark({ size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path d={KIWI_PATH} fill="currentColor" />
    </svg>
  );
}
