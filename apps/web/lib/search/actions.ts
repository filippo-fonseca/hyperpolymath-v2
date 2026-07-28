"use server";

import { getUserIdOrRedirect } from "@/lib/auth/get-user";
import type { SearchSnapshot } from "@/lib/search";
import { getSearchSnapshot } from "@/lib/search/snapshot";

/**
 * Refetch the global-search snapshot for the authenticated user. Called by the
 * client SearchProvider after paint, and again (debounced) whenever realtime
 * reports a write to anything the index covers. Auth-scoped server-side.
 *
 * The id is all this needs, so it takes the claims-only gate. getUserOrRedirect
 * selected the whole public.users row to read one column off it, and because
 * this runs as its own request it could not dedupe against the layout's copy:
 * that was one statement per snapshot refetch, every time.
 */
export async function fetchSearchSnapshot(): Promise<SearchSnapshot> {
  const userId = await getUserIdOrRedirect();
  return getSearchSnapshot(userId);
}
