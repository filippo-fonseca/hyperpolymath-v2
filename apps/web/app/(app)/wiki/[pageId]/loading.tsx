import { WikiPageSkeleton } from "@/components/wiki/WikiSkeletons";

/**
 * /wiki/[pageId] route-level loading boundary. App Router prefetch for a
 * dynamic route warms up to the nearest loading boundary, so this is what a
 * click paints immediately: the document's header and body as placeholders at
 * the exact page measure, rather than the app-wide loader.
 */
export default function WikiPageLoading() {
  return <WikiPageSkeleton />;
}
