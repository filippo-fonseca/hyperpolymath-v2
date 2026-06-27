import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  /** Pixel size of the glyph. Matches the lucide `size` prop. Defaults to 14. */
  size?: number;
  /** Extra classes (color, margin). The spin animation is always applied. */
  className?: string;
  /** Accessible label for screen readers. Defaults to "Loading". */
  label?: string;
}

/**
 * Spinner — the canonical inline busy glyph for pending CRUD (issue #25).
 *
 * Standardizes the ad-hoc `<Loader2 className="animate-spin" />` that was
 * scattered across submit buttons so every in-flight mutation reads the same
 * way: a hairline cyan-tinted rotor inline with the button label. Pair with a
 * `disabled` state driven by `usePendingAction`'s `pending` (or a
 * `useTransition` `isPending`) so a busy button can't be re-fired.
 *
 * Inherits `currentColor`, so on solid buttons it picks up the canvas ink and
 * on ghost/outline buttons it picks up the foreground ink automatically.
 */
export function Spinner({ size = 14, className, label = "Loading" }: Props) {
  return (
    <Loader2
      size={size}
      strokeWidth={1.75}
      className={cn("animate-spin", className)}
      role="status"
      aria-label={label}
    />
  );
}
