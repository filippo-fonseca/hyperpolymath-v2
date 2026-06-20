/**
 * Edge derivation — PURE function over already-loaded nodes.
 *
 * No DB access. Walks the loaded nodes (projects, tasks, captures, facts)
 * and emits the typed Edge[] for the snapshot. Project→area only emits if
 * the referenced area is in the loaded set (defensive: if an area is
 * archived but a project still references it, we drop the edge rather
 * than emit a dangling reference).
 *
 * Fact-about edges require entity metadata on the fact; v1's jarvisFacts
 * loader doesn't expose `aboutEntityType` / `aboutEntityId` (the schema's
 * `type`/`key` aren't a typed entity reference), so the input shape allows
 * those fields optionally — they emit only when supplied. Future schema
 * versions can wire this without breaking the edge derivation.
 */

import type { Edge, Node } from "./types";

export type FactReference = {
  id: string;
  aboutEntityType?: "area" | "project";
  aboutEntityId?: string;
};

export function deriveEdges(input: {
  areaIds: Set<string>;
  projects: Extract<Node, { type: "project" }>[];
  tasks: Extract<Node, { type: "task" }>[];
  captures: Extract<Node, { type: "capture" }>[];
  pages: Extract<Node, { type: "page" }>[];
  facts: FactReference[];
}): Edge[] {
  const edges: Edge[] = [];

  for (const p of input.projects) {
    if (input.areaIds.has(p.areaId)) {
      edges.push({ type: "project_in_area", from: p.id, to: p.areaId });
    }
  }

  for (const t of input.tasks) {
    for (const pid of t.projectIds) {
      edges.push({ type: "task_in_project", from: t.id, to: pid });
    }
  }

  for (const c of input.captures) {
    for (const pid of c.projectIds) {
      edges.push({ type: "capture_in_project", from: c.id, to: pid });
    }
    for (const tag of c.tags) {
      edges.push({ type: "capture_tagged", from: c.id, tag });
    }
  }

  for (const page of input.pages) {
    for (const pid of page.projectIds) {
      edges.push({ type: "page_in_project", from: page.id, to: pid });
    }
  }

  for (const f of input.facts) {
    if (f.aboutEntityType && f.aboutEntityId) {
      edges.push({
        type: "fact_about",
        from: f.id,
        entityType: f.aboutEntityType,
        entityId: f.aboutEntityId,
      });
    }
  }

  return edges;
}
