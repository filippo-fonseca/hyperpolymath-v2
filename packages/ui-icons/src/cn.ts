import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Local copy of the web app's `@/lib/utils` `cn`, identical in behaviour. The
 * package can't reach the app's `@/` alias, and duplicating four lines is the
 * cheaper trade against making every consumer inject a class merger.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
