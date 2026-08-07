import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";

/** The two selectable kinds of item inside the Explorer. */
export type ExplorerItem =
  | { kind: "folder"; id: string; folder: FolderRow; itemCount: number }
  | { kind: "page"; id: string; page: PageWithProjects };

export type ExplorerSortMode = "manual" | "name" | "updated" | "created";

/** `page:<uuid>` or `folder:<uuid>` — encoded stable id for selection + dnd. */
export function explorerItemId(item: ExplorerItem): string {
  return `${item.kind}:${item.id}`;
}
