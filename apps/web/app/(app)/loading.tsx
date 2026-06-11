import { GlobalLoader } from "@/components/shell/GlobalLoader";

/**
 * App-shell Suspense fallback. Next 16 renders this between any (app) route
 * segment transition that suspends. Covers cross-page navigation and any
 * server-component data fetch within an (app) page that hasn't streamed yet.
 */
export default function Loading() {
  return <GlobalLoader fullscreen={false} />;
}
