import type { Metadata } from "next";
import { SearchPageClient } from "@/components/search/SearchPageClient";
import { requireOnboarded } from "@/lib/auth/get-user";

export const metadata: Metadata = {
  title: "Search",
};

/**
 * /search — full-page global search. The search index itself is supplied by
 * the SearchProvider mounted in the (app) layout, so this route only enforces
 * the onboarding gate and mounts the client surface.
 */
export default async function SearchPage() {
  await requireOnboarded();
  return <SearchPageClient />;
}
