import { PagesListClient } from "@/components/pages/PagesListClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getFolderProjects, getFoldersForUser } from "@/lib/db/queries/folders";
import { getPagesForUser } from "@/lib/db/queries/pages";

/**
 * /wiki — Wiki list (wiki-style markdown documents).
 *
 * Server Component shell: auth, initial fetch, then hands off to
 * PagesListClient for Realtime-backed interactivity. Folders (project-
 * independent, with their parent_id hierarchy) and their folder_projects links
 * are loaded so the home renders the Folder > Subfolder > Page tree plus
 * standalone pages (Phase 21).
 */
export default async function PagesPage() {
  const user = await requireOnboarded();
  const [initialPages, initialFolders, initialFolderProjects] =
    await Promise.all([
      getPagesForUser(user.id),
      getFoldersForUser(user.id),
      getFolderProjects(user.id),
    ]);

  return (
    <PagesListClient
      userId={user.id}
      initialPages={initialPages}
      initialFolders={initialFolders}
      initialFolderProjects={initialFolderProjects}
    />
  );
}
