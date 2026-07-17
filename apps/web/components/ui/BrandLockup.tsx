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
 * both in one ink.
 *
 * The banner sets the mark at ~0.67× the wordmark's font size, but that ratio
 * is struck at a 132px wordmark and does not survive the trip down to 16px
 * sidebar type: 0.67 × 16 ≈ 11px, at which the silhouette's legs and beak
 * collapse into mush. The mark is optically matched at this size instead
 * (`markSize`), which is the same call the dimensional icon set makes — it
 * draws on an 80 viewBox and fills ~62% of it, so an "18px" nav icon carries
 * ~11px of actual ink. The kiwi spans its full 24 viewBox, so it needs a
 * smaller nominal size to weigh the same on the page.
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
