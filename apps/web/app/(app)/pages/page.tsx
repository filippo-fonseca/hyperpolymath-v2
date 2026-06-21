import { PagesListClient } from "@/components/pages/PagesListClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getFoldersForUser } from "@/lib/db/queries/folders";
import { getPagesForUser } from "@/lib/db/queries/pages";
import { getSidebarTree } from "@/lib/db/queries/sidebar";

/**
 * /pages — Pages list (wiki-style markdown documents).
 *
 * Server Component shell: auth, initial fetch, then hands off to
 * PagesListClient for Realtime-backed interactivity. Areas/projects (incl.
 * archived) and folders are loaded so the home renders the full
 * Area > Project > Folder > Page tree.
 */
export default async function PagesPage() {
  const user = await requireOnboarded();
  const [initialPages, initialFolders, initialTree] = await Promise.all([
    getPagesForUser(user.id),
    getFoldersForUser(user.id),
    getSidebarTree(user.id, true),
  ]);

  return (
    <PagesListClient
      userId={user.id}
      initialPages={initialPages}
      initialFolders={initialFolders}
      initialTree={initialTree}
    />
  );
}
