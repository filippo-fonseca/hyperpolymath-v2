import { WikiHomeSkeleton } from "@/components/wiki/WikiSkeletons";

/**
 * /wiki route-level loading boundary. Paints the wiki home's own geometry
 * instead of the app-wide loader, so entering the wiki shows its shape at once
 * and the explorer lands on top of it without a reflow.
 */
export default function WikiLoading() {
  return <WikiHomeSkeleton />;
}
