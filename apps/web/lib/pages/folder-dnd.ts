/**
 * Pure, framework-free helpers for the Wiki-home drag-and-drop tree. Kept out of
 * the React component so the id encoding and the move-resolution logic (which
 * folder/page goes where, and which gestures are no-ops or cycles) are trivially
 * unit-testable.
 *
 * The Wiki tree is a hierarchical "move into container" DnD, not a flat sortable
 * list: a page can be dropped into any folder (or out to no folder), and a
 * folder can be dropped into any other folder (or back to the top level), as
 * long as the move would not make a folder a descendant of itself.
 */

import type { FolderRow } from "@/lib/pages/folder-projects";

export type DragItem =
  | { kind: "page"; id: string }
  | { kind: "folder"; id: string };

/** Where a drag can land: into a folder, or onto the top-level (no-folder) zone. */
export type DropTarget = { kind: "folder"; id: string } | { kind: "root" };

/** Droppable id for the always-available "move to top level" / "no folder" zone. */
export const DND_ROOT_ID = "wiki-root-zone";

export function encodeDraggableId(item: DragItem): string {
  return `${item.kind}:${item.id}`;
}

export function parseDraggableId(raw: string): DragItem | null {
  if (raw.startsWith("page:")) return { kind: "page", id: raw.slice("page:".length) };
  if (raw.startsWith("folder:"))
    return { kind: "folder", id: raw.slice("folder:".length) };
  return null;
}

export function parseDroppableId(raw: string): DropTarget | null {
  if (raw === DND_ROOT_ID) return { kind: "root" };
  if (raw.startsWith("folder:"))
    return { kind: "folder", id: raw.slice("folder:".length) };
  return null;
}

/** folderId -> list of its direct child folder ids. */
export function buildChildrenMap(folders: FolderRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = map.get(f.parentId);
    if (list) list.push(f.id);
    else map.set(f.parentId, [f.id]);
  }
  return map;
}

/**
 * True if `candidate` is `folderId` itself or any descendant of it. Used to
 * reject moving a folder into its own subtree (which would orphan a cycle).
 * Cycle-safe via a visited set so a corrupt parent chain can never spin forever.
 */
export function isSelfOrDescendant(
  folderId: string,
  candidate: string,
  childrenOf: Map<string, string[]>,
): boolean {
  if (candidate === folderId) return true;
  const stack = [...(childrenOf.get(folderId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === candidate) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return false;
}

/** A folder id plus every descendant folder id (the subtree a delete removes). */
export function collectSubtreeIds(
  folderId: string,
  childrenOf: Map<string, string[]>,
): string[] {
  const out: string[] = [folderId];
  const stack = [...(childrenOf.get(folderId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

export type Move =
  | { kind: "page"; pageId: string; folderId: string | null }
  | { kind: "folder"; folderId: string; parentId: string | null };

/**
 * Resolve a drag + drop gesture into the intended mutation, or null when it is a
 * no-op (dropping where the item already lives) or invalid (moving a folder into
 * its own descendant). The server actions guard the same cycle case (defence in
 * depth); resolving here keeps the optimistic UI from flashing an illegal move.
 */
export function resolveMove(
  drag: DragItem,
  drop: DropTarget,
  ctx: {
    pageFolderOf: Map<string, string | null>;
    folderParentOf: Map<string, string | null>;
    childrenOf: Map<string, string[]>;
  },
): Move | null {
  if (drag.kind === "page") {
    const target = drop.kind === "folder" ? drop.id : null;
    const current = ctx.pageFolderOf.get(drag.id) ?? null;
    if (current === target) return null;
    return { kind: "page", pageId: drag.id, folderId: target };
  }

  const target = drop.kind === "folder" ? drop.id : null;
  const current = ctx.folderParentOf.get(drag.id) ?? null;
  if (current === target) return null;
  if (target !== null && isSelfOrDescendant(drag.id, target, ctx.childrenOf)) {
    return null;
  }
  return { kind: "folder", folderId: drag.id, parentId: target };
}
