"use server";

import { getUserOrRedirect } from "@/lib/auth/get-user";
import type { SearchSnapshot } from "@/lib/search";
import { getSearchSnapshot } from "@/lib/search/snapshot";

/**
 * Refetch the global-search snapshot for the authenticated user. Called by the
 * client SearchProvider on window focus so the in-memory index stays fresh
 * after mutations made elsewhere in the session. Auth-scoped server-side.
 */
export async function fetchSearchSnapshot(): Promise<SearchSnapshot> {
  const user = await getUserOrRedirect();
  return getSearchSnapshot(user.id);
}
