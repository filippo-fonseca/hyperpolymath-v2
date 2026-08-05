import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The six-step type ladder (globals.css `--text-display` … `--text-micro`) is
 * registered with Tailwind as real font-size utilities, but tailwind-merge
 * only knows its own built-in `text-xs` … `text-9xl` scale. Any name it does
 * not recognise falls into the `text-color` group instead — so in a call like
 *
 *   cn("text-micro", "text-[var(--ink-faint)]")
 *
 * it saw two colours, kept the last, and silently DROPPED the size. The
 * element then inherited 16px, which is exactly the "weird big fonts" bug
 * (sidebar section eyebrows, dock status lines) that surfaced once the craft
 * sweep put ladder steps and token colours through the same `cn()` call.
 *
 * Declaring the ladder here teaches tailwind-merge that these six are sizes,
 * so a size and a colour stop cancelling each other. Keep this list in sync
 * with the `--text-*` block in globals.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            // App chrome ladder.
            "display",
            "title",
            "subtitle",
            "body",
            "meta",
            "micro",
            // Landing-only editorial extension.
            "hero",
            "headline",
            "lead",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
