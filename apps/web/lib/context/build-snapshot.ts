/**
 * buildSnapshot — the canonical "what does the agent know about Filippo" function.
 *
 * Phase 999.12 CTX-02. Pure deterministic builder: 7 loaders run in parallel,
 * edges derive purely from the loaded nodes, ContextSnapshotSchema validates
 * the assembled payload before returning. Result<T> contract — never throws.
 *
 * Every downstream consumer (cron route, MCP tools, settings preview) goes
 * through here so the snapshot stays the single source of truth for what the
 * agent sees.
 *
 * The optional `db` parameter is the injection point for tests (and the cron
 * route uses the default `db` import).
 */

import { db as defaultDb } from "@/lib/db";
import { type Result, ok, err } from "@/lib/integrations/result";
import {
  ContextSnapshotSchema,
  CURRENT_SCHEMA_VERSION,
  type ContextSnapshot,
  type Node,
} from "./types";
import { deriveEdges, type PersonReference } from "./edges";
import { loadAreas } from "./nodes/areas";
import { loadProjects } from "./nodes/projects";
import { loadTasks } from "./nodes/tasks";
import { loadCaptures } from "./nodes/captures";
import { loadTraining } from "./nodes/training";
import { loadHabits } from "./nodes/habits";
import { loadJarvisFacts } from "./nodes/jarvis-facts";
import { loadJournalEntries } from "./nodes/journal";
import { loadPages } from "./nodes/pages";
import { loadPeople, loadPeopleReferences } from "./nodes/people";

export { CURRENT_SCHEMA_VERSION };

export type DB = typeof defaultDb;

const PERSON_REF_FROM_TYPES: readonly PersonReference["fromType"][] = [
  "task",
  "capture",
  "page",
  "jarvis_fact",
  "event",
];

/** Narrow a raw text from_type to the mentions_person edge enum. */
function isPersonRefFromType(t: string): t is PersonReference["fromType"] {
  return (PERSON_REF_FROM_TYPES as readonly string[]).includes(t);
}

export async function buildSnapshot(
  userId: string,
  db: DB = defaultDb,
): Promise<Result<ContextSnapshot>> {
  try {
    const [
      areas,
      projects,
      tasks,
      captures,
      training,
      habits,
      facts,
      journal,
      pagesResult,
      peopleResult,
      references,
    ] = await Promise.all([
      loadAreas(userId, db),
      loadProjects(userId, db),
      loadTasks(userId, db),
      loadCaptures(userId, db),
      loadTraining(userId, db),
      loadHabits(userId, db),
      loadJarvisFacts(userId, db),
      loadJournalEntries(userId, db),
      loadPages(userId, db),
      loadPeople(userId, db),
      loadPeopleReferences(userId, db),
    ]);

    const allNodes: Node[] = [
      ...areas.nodes,
      ...projects.nodes,
      ...tasks.nodes,
      ...captures.nodes,
      ...training.nodes,
      ...habits.nodes,
      ...facts.nodes,
      ...journal.nodes,
      ...pagesResult.nodes,
      ...peopleResult.nodes,
    ];

    const areaIds = new Set(
      areas.nodes.filter((n): n is Extract<Node, { type: "area" }> => n.type === "area").map((n) => n.id),
    );
    const projectNodes = projects.nodes.filter(
      (n): n is Extract<Node, { type: "project" }> => n.type === "project",
    );
    const taskNodes = tasks.nodes.filter(
      (n): n is Extract<Node, { type: "task" }> => n.type === "task",
    );
    const captureNodes = captures.nodes.filter(
      (n): n is Extract<Node, { type: "capture" }> => n.type === "capture",
    );
    const pageNodes = pagesResult.nodes.filter(
      (n): n is Extract<Node, { type: "page" }> => n.type === "page",
    );
    const personNodes = peopleResult.nodes.filter(
      (n): n is Extract<Node, { type: "person" }> => n.type === "person",
    );

    const edges = deriveEdges({
      areaIds,
      projects: projectNodes,
      tasks: taskNodes,
      captures: captureNodes,
      pages: pageNodes,
      // v1 facts don't carry entity references — empty for now; future schema
      // bumps can wire fact_about edges without breaking deriveEdges' signature.
      facts: facts.nodes
        .filter((n): n is Extract<Node, { type: "jarvis_fact" }> => n.type === "jarvis_fact")
        .map((n) => ({ id: n.id })),
      people: personNodes,
      references: references.flatMap((r) =>
        isPersonRefFromType(r.fromType)
          ? [{ fromType: r.fromType, fromId: r.fromId, personId: r.personId }]
          : [],
      ),
    });

    const nodeCounts: Record<string, number> = {};
    for (const n of allNodes) {
      nodeCounts[n.type] = (nodeCounts[n.type] ?? 0) + 1;
    }

    const snapshot: ContextSnapshot = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      nodes: allNodes,
      edges,
      meta: {
        totalNodes: allNodes.length,
        totalEdges: edges.length,
        nodeCounts,
        excludedNoExportCount:
          tasks.excluded + captures.excluded + facts.excluded + journal.excluded + pagesResult.excluded,
      },
    };

    // Belt-and-suspenders: even though every loader emits typed nodes,
    // re-parse so any drift between loader and schema is caught here, not
    // downstream in the MCP server.
    return ok(ContextSnapshotSchema.parse(snapshot));
  } catch (e) {
    return err(e instanceof Error ? e.message : "snapshot build failed");
  }
}
