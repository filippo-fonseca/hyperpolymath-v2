import type { FolderRow } from "@/lib/db/queries/folders";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

export interface TreePage {
  id: string;
  title: string;
  emoji: string | null;
  updatedAt: Date;
  pinned: boolean;
}

export interface TreeFolder {
  id: string;
  name: string;
  pages: TreePage[];
}

export interface TreeProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  folders: TreeFolder[];
  loosePages: TreePage[];
}

export interface TreeArea {
  id: string;
  name: string;
  emoji: string | null;
  projects: TreeProject[];
}

export interface PagesTree {
  areas: TreeArea[];
  /** Pages not linked to any project. */
  unfiled: TreePage[];
}

function toTreePage(p: PageWithProjects): TreePage {
  return { id: p.id, title: p.title, emoji: p.emoji, updatedAt: p.updatedAt, pinned: p.pinned };
}

/**
 * Assemble the Pages-home tree from the sidebar (areas + projects), the user's
 * folders, and pages (each carrying its per-project folder placement).
 *
 * A page appears once per project it's linked to — under its folder there, or
 * loose under the project when unfiled. Pages with no project link fall into
 * `unfiled`. Pages preserve the input order (pinned-first, recent-first), so the
 * caller controls sort by ordering `pages`. Empty projects/areas are pruned.
 */
export function buildPagesTree(
  areas: SidebarArea[],
  folders: FolderRow[],
  pages: PageWithProjects[]
): PagesTree {
  // folderId -> page list, projectId -> loose page list
  const pagesByFolder = new Map<string, TreePage[]>();
  const loosePagesByProject = new Map<string, TreePage[]>();
  const folderProject = new Map<string, string>();
  for (const f of folders) folderProject.set(f.id, f.projectId);

  const unfiled: TreePage[] = [];

  for (const page of pages) {
    if (page.projects.length === 0) {
      unfiled.push(toTreePage(page));
      continue;
    }
    for (const link of page.projects) {
      // Defensive: only honor a folder that actually belongs to this project.
      const folderOk = link.folderId !== null && folderProject.get(link.folderId) === link.id;
      if (folderOk && link.folderId) {
        const list = pagesByFolder.get(link.folderId) ?? [];
        list.push(toTreePage(page));
        pagesByFolder.set(link.folderId, list);
      } else {
        const list = loosePagesByProject.get(link.id) ?? [];
        list.push(toTreePage(page));
        loosePagesByProject.set(link.id, list);
      }
    }
  }

  const foldersByProject = new Map<string, FolderRow[]>();
  for (const f of folders) {
    const list = foldersByProject.get(f.projectId) ?? [];
    list.push(f);
    foldersByProject.set(f.projectId, list);
  }

  const treeAreas: TreeArea[] = [];
  for (const area of areas) {
    const treeProjects: TreeProject[] = [];
    for (const proj of area.projects) {
      const projFolders = (foldersByProject.get(proj.id) ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        pages: pagesByFolder.get(f.id) ?? [],
      }));
      const loosePages = loosePagesByProject.get(proj.id) ?? [];
      // Prune projects with no wiki content at all.
      if (projFolders.length === 0 && loosePages.length === 0) continue;
      treeProjects.push({
        id: proj.id,
        name: proj.name,
        icon: proj.icon,
        isClass: proj.isClass,
        folders: projFolders,
        loosePages,
      });
    }
    if (treeProjects.length === 0) continue;
    treeAreas.push({
      id: area.id,
      name: area.name,
      emoji: area.emoji,
      projects: treeProjects,
    });
  }

  return { areas: treeAreas, unfiled };
}
