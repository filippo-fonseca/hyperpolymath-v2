import {
  type FolderProjectLink,
  type FolderRow,
  type FolderWithProjects,
  getEffectiveProjectIds,
} from "@/lib/pages/folder-projects";
import { useMemo } from "react";

/** Resolve each folder's effective project links to display names client-side. */
export function useExplorerProjectNames(
  folders: FolderRow[],
  folderProjects: FolderProjectLink[],
  projects: { id: string; name: string }[]
): Map<string, string[]> {
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name] as const)),
    [projects]
  );
  return useMemo(() => {
    const folderMap = new Map<string, FolderWithProjects>(
      folders.map((folder) => [folder.id, { ...folder, ownProjectIds: [] }])
    );
    for (const link of folderProjects) {
      folderMap.get(link.folderId)?.ownProjectIds.push(link.projectId);
    }
    return new Map(
      folders.map((folder) => [
        folder.id,
        getEffectiveProjectIds(folder.id, folderMap)
          .map((projectId) => projectNames.get(projectId))
          .filter((name): name is string => Boolean(name)),
      ])
    );
  }, [folderProjects, folders, projectNames]);
}
