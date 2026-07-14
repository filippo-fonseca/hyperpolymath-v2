import { cn } from "@/lib/utils";

interface Props {
  /** Renders the "H" monogram instead of the full wordmark (collapsed rail). */
  collapsed?: boolean;
  className?: string;
}

/**
 * The "Hyperpolymath" wordmark — the one and only place EB Garamond is allowed
 * to appear (UI contract R2). Everything else in the app is Space Grotesk.
 *
 * The serif reaches this component through --font-logotype; no other token or
 * utility resolves to EB Garamond. If you need the brand mark, use this
 * component rather than reaching for a serif class.
 */
export function Logotype({ collapsed = false, className }: Props) {
  return (
    <span
      className={cn(
        "font-logotype font-medium text-[var(--ink)] select-none",
        className,
      )}
      style={{ letterSpacing: "-0.01em" }}
    >
      {collapsed ? "H" : "Hyperpolymath"}
    </span>
  );
}
