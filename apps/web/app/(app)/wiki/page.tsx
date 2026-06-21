import { PagesListClient } from "@/components/pages/PagesListClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getPagesForUser } from "@/lib/db/queries/pages";

/**
 * /wiki — Wiki list (wiki-style markdown documents).
 *
 * Server Component shell: auth, initial fetch, then hands off to
 * PagesListClient for Realtime-backed interactivity.
 */
export default async function PagesPage() {
  const user = await requireOnboarded();
  const initialPages = await getPagesForUser(user.id);

  return <PagesListClient userId={user.id} initialPages={initialPages} />;
}
