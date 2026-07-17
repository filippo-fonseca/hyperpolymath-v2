import { KiwiMark } from "@/components/ui/KiwiMark";
import { Logotype } from "@/components/ui/Logotype";
import { cn } from "@/lib/utils";

interface Props {
  /** Mark only, no wordmark — for chrome too narrow to carry the lockup. */
  markOnly?: boolean;
  /** Mark size in px. The wordmark scales via the `text-[…]` on `className`. */
  markSize?: number;
  className?: string;
}

/**
 * The Hyperpolymath lockup: kiwi mark + wordmark, side by side.
 *
 * This is the /branding banner treatment (`renderBannerJsx` in
 * `lib/branding/svg.tsx`) brought in-app: the mark leads, the wordmark follows,
 * both in one ink. The proportions are ported rather than reinvented — the
 * banner draws the mark at ~0.67× the wordmark's font size, which is why an
 * 18px mark pairs with the header's 16px type.
 *
 * The wordmark delegates to `Logotype`, which owns the ONE sanctioned use of EB
 * Garamond (`--font-logotype`). Both parts inherit `--ink` so the lockup stays
 * monochrome in either theme — matching brand canon, where the mark is drawn in
 * the foreground ink and never in cyan.
 */
export function BrandLockup({ markOnly = false, markSize = 18, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-2 leading-none text-[var(--ink)]",
        className
      )}
    >
      <KiwiMark size={markSize} />
      {!markOnly && <Logotype className="truncate" />}
    </span>
  );
}
