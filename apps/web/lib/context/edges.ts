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

/**
 * A (from-entity -> person) reference row. `fromType` discriminates the kind of
 * entity the `fromId` points at so the mentions_person edge can carry it.
 */
export type PersonReference = {
  fromType: "task" | "capture" | "page" | "jarvis_fact" | "event";
  fromId: string;
  personId: string;
};

export function deriveEdges(input: {
  areaIds: Set<string>;
  projects: Extract<Node, { type: "project" }>[];
  tasks: Extract<Node, { type: "task" }>[];
  captures: Extract<Node, { type: "capture" }>[];
  pages: Extract<Node, { type: "page" }>[];
  facts: FactReference[];
  /** Person nodes loaded into the snapshot (cardinality-capped upstream). */
  people?: Extract<Node, { type: "person" }>[];
  /** Raw (from-entity -> person) reference rows. */
  references?: PersonReference[];
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
    if (page.folderId) {
      edges.push({ type: "page_in_folder", from: page.id, to: page.folderId });
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

  // mentions_person: link a referencing entity to a person, but only when BOTH
  // endpoints are in the loaded node set. We drop dangling edges (a reference to
  // a person beyond the people cap, or to an entity not loaded for its type)
  // exactly like project_in_area drops edges to unloaded areas.
  const personIds = new Set((input.people ?? []).map((p) => p.id));
  const idsByFromType: Record<PersonReference["fromType"], Set<string>> = {
    task: new Set(input.tasks.map((t) => t.id)),
    capture: new Set(input.captures.map((c) => c.id)),
    page: new Set(input.pages.map((p) => p.id)),
    // jarvis_fact and event nodes are not loaded into the edge derivation set
    // today, so references from them have no resolvable `from` endpoint and are
    // dropped. Future loaders can populate these without changing the contract.
    jarvis_fact: new Set<string>(),
    event: new Set<string>(),
  };
  for (const ref of input.references ?? []) {
    if (!personIds.has(ref.personId)) continue;
    if (!idsByFromType[ref.fromType]?.has(ref.fromId)) continue;
    edges.push({
      type: "mentions_person",
      from: ref.fromId,
      to: ref.personId,
      fromType: ref.fromType,
    });
  }

  return edges;
}
