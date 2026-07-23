import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  areas,
  captures,
  pageFolders,
  pages,
  people,
  projects,
  tasks,
  tasksProjects,
} from "@/lib/db/schema";
import {
  type EntityRef,
  type EntityRefType,
  captureLabel,
  dedupeReferences,
  parseReferences,
} from "@/lib/references/token";

/**
 * Inbound reference resolution for JARVIS (S9).
 *
 * When the user writes "add this to @[Marathon Training](ref://project/…)", the
 * model needs to bind that instruction to the exact project id — not re-search
 * by name and risk hitting the wrong one. This module parses the S1 tokens out
 * of the current message and recent history, resolves each to a compact summary
 * of the live entity (userId-scoped, always), and formats a
 * `<referenced_entities>` block the route injects into the system prompt.
 *
 * Two rules keep it honest:
 *   - Every DB read is scoped to the requesting user in its WHERE clause. The
 *     app connects as BYPASSRLS, so a missing scope is a cross-tenant leak, not
 *     a caught error. A token can hold any uuid the user pasted or guessed.
 *   - A token whose target no longer exists is NOT dropped. It resolves to a
 *     one-line tombstone (status "deleted") so the model knows the user pointed
 *     at something dead and can say so, rather than silently searching by name.
 */

/** How many distinct references we resolve per turn. */
export const MAX_RESOLVED_REFERENCES = 8;

/** A reference resolved (or found dead) against the database. */
export interface ResolvedReference {
  type: EntityRefType;
  id: string;
  /** "resolved" — the row exists; "deleted" — it's gone, render a tombstone. */
  status: "resolved" | "deleted";
  /** Live title for a resolved row; the token's snapshot label for a tombstone. */
  title: string;
  /** Compact context line (~200 chars). Omitted for tombstones. */
  summary?: string;
}

const SUMMARY_MAX = 200;
const TITLE_MAX = 80;

/** Collapse whitespace and truncate with an ellipsis. */
function clamp(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The text of a conversation message, for token scanning.
 *
 * Only `text` blocks count as "what the user wrote": a user-role turn can also
 * carry `tool_result` blocks (our own tool feedback, which now embeds ref
 * tokens), and those are machine output, not the user pointing at something.
 */
function messageText(
  content:
    | string
    | Array<{ type: string; [k: string]: unknown }>,
): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

/**
 * The user-authored texts of the prior turns, newest first.
 *
 * The last message is the current turn's user message — its tokens come in via
 * `input`, so it's excluded here to avoid resolving the same message twice
 * (harmless after dedupe, but this keeps "current input first" literal).
 */
export function historyUserTextsNewestFirst(
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    content: string | Array<{ type: string; [k: string]: unknown }>;
  }>,
): string[] {
  const history = messages.slice(0, -1);
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user") continue;
    const text = messageText(m.content);
    if (text) out.push(text);
  }
  return out;
}

/**
 * The distinct references to resolve, in resolution order: the current input
 * first, then history newest→oldest, deduped by (type, id) and capped.
 *
 * Pure — no DB — so the ordering/dedup/cap contract is unit-testable on its own.
 */
export function collectReferencesForResolution(
  input: string,
  historyUserTexts: readonly string[],
  cap: number = MAX_RESOLVED_REFERENCES,
): EntityRef[] {
  const all: EntityRef[] = [];
  const push = (text: string) => {
    for (const r of parseReferences(text)) {
      all.push({ type: r.type, id: r.id, label: r.label });
    }
  };
  push(input);
  for (const text of historyUserTexts) push(text);
  return dedupeReferences(all).slice(0, cap);
}

/** Group ref ids by type, so each entity table is queried at most once. */
function idsByType(refs: readonly EntityRef[]): Map<EntityRefType, string[]> {
  const byType = new Map<EntityRefType, string[]>();
  for (const ref of refs) {
    const ids = byType.get(ref.type);
    if (ids) ids.push(ref.id);
    else byType.set(ref.type, [ref.id]);
  }
  return byType;
}

/** One resolved entity's display halves, keyed by id within a type. */
interface Resolution {
  title: string;
  summary?: string;
}

async function resolveCaptures(
  userId: string,
  ids: string[],
): Promise<Map<string, Resolution>> {
  const rows = await db
    .select({ id: captures.id, content: captures.content })
    .from(captures)
    .where(and(eq(captures.userId, userId), inArray(captures.id, ids)));
  const out = new Map<string, Resolution>();
  for (const r of rows) {
    out.set(r.id, {
      title: captureLabel(r.content),
      summary: clamp(r.content, SUMMARY_MAX),
    });
  }
  return out;
}

async function resolveTasks(
  userId: string,
  ids: string[],
): Promise<Map<string, Resolution>> {
  // Left-join projects so the summary can name the task's project; a task with
  // several projects yields several rows, deduped by id below.
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(tasksProjects, eq(tasksProjects.taskId, tasks.id))
    .leftJoin(projects, eq(projects.id, tasksProjects.projectId))
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)));

  const acc = new Map<
    string,
    { title: string; status: string; projects: string[] }
  >();
  for (const r of rows) {
    const entry = acc.get(r.id) ?? {
      title: r.title,
      status: r.status,
      projects: [],
    };
    if (r.projectName && !entry.projects.includes(r.projectName)) {
      entry.projects.push(r.projectName);
    }
    acc.set(r.id, entry);
  }

  const out = new Map<string, Resolution>();
  for (const [id, e] of acc) {
    const parts = [`status: ${e.status}`];
    if (e.projects.length > 0) parts.push(`project: ${e.projects.join(", ")}`);
    out.set(id, {
      title: clamp(e.title, TITLE_MAX),
      summary: clamp(parts.join(" · "), SUMMARY_MAX),
    });
  }
  return out;
}

async function resolvePages(
  userId: string,
  ids: string[],
): Promise<Map<string, Resolution>> {
  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      folderName: pageFolders.name,
    })
    .from(pages)
    .leftJoin(pageFolders, eq(pageFolders.id, pages.folderId))
    .where(and(eq(pages.userId, userId), inArray(pages.id, ids)));
  const out = new Map<string, Resolution>();
  for (const r of rows) {
    out.set(r.id, {
      title: clamp(r.title || "Untitled page", TITLE_MAX),
      summary: r.folderName ? `folder: ${clamp(r.folderName, 60)}` : "no folder",
    });
  }
  return out;
}

async function resolveProjects(
  userId: string,
  ids: string[],
): Promise<Map<string, Resolution>> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), inArray(projects.id, ids)));
  const out = new Map<string, Resolution>();
  for (const r of rows) {
    out.set(r.id, {
      title: clamp(r.name, TITLE_MAX),
      summary: r.description ? clamp(r.description, SUMMARY_MAX) : undefined,
    });
  }
  return out;
}

async function resolveAreas(
  userId: string,
  ids: string[],
): Promise<Map<string, Resolution>> {
  // Areas carry only a name (no description column) — the name is the summary.
  const rows = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(and(eq(areas.userId, userId), inArray(areas.id, ids)));
  const out = new Map<string, Resolution>();
  for (const r of rows) out.set(r.id, { title: clamp(r.name, TITLE_MAX) });
  return out;
}

async function resolvePeople(
  userId: string,
  ids: string[],
): Promise<Map<string, Resolution>> {
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      email: people.email,
      bio: people.bio,
    })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, ids)));
  const out = new Map<string, Resolution>();
  for (const r of rows) {
    const parts: string[] = [];
    if (r.email) parts.push(r.email);
    if (r.bio) parts.push(r.bio);
    out.set(r.id, {
      title: clamp(r.name, TITLE_MAX),
      summary: parts.length > 0 ? clamp(parts.join(" · "), SUMMARY_MAX) : undefined,
    });
  }
  return out;
}

const RESOLVERS: Record<
  EntityRefType,
  (userId: string, ids: string[]) => Promise<Map<string, Resolution>>
> = {
  capture: resolveCaptures,
  task: resolveTasks,
  page: resolvePages,
  project: resolveProjects,
  area: resolveAreas,
  person: resolvePeople,
};

/**
 * Resolve each reference against the DB, preserving input order.
 *
 * One query per distinct kind actually present. A ref with no matching row
 * becomes a tombstone carrying the token's snapshot label.
 */
export async function resolveReferences(
  userId: string,
  refs: readonly EntityRef[],
): Promise<ResolvedReference[]> {
  const byType = idsByType(refs);
  const resolvedByType = new Map<EntityRefType, Map<string, Resolution>>();
  await Promise.all(
    Array.from(byType, async ([type, ids]) => {
      resolvedByType.set(type, await RESOLVERS[type](userId, ids));
    }),
  );

  return refs.map((ref) => {
    const found = resolvedByType.get(ref.type)?.get(ref.id);
    if (!found) {
      return {
        type: ref.type,
        id: ref.id,
        status: "deleted" as const,
        title: clamp(ref.label || "(untitled)", TITLE_MAX),
      };
    }
    return {
      type: ref.type,
      id: ref.id,
      status: "resolved" as const,
      title: found.title || clamp(ref.label || "(untitled)", TITLE_MAX),
      ...(found.summary ? { summary: found.summary } : {}),
    };
  });
}

/**
 * Render resolved references as the `<referenced_entities>` system block.
 *
 * Pure and stable-ordered (input order). Returns "" for no entries so the
 * caller injects the block only when at least one reference was present.
 */
export function formatReferencedEntitiesBlock(
  entries: readonly ResolvedReference[],
): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    if (e.status === "deleted") {
      return `[${e.type}] id=${e.id} "${e.title}" (deleted — this entity no longer exists; do not act on it, tell the user it's gone)`;
    }
    const summary = e.summary ? ` — ${e.summary}` : "";
    return `[${e.type}] id=${e.id} "${e.title}"${summary}`;
  });
  return [
    "<referenced_entities>",
    'The user\'s message points at these existing entities via @-mention tokens. When the instruction refers to one of them ("add this to @X", "move it to @Y", "what\'s in @Z"), use the exact id below — do NOT search by name. Only ids listed here or returned by a tool this turn are real; never invent one.',
    ...lines,
    "</referenced_entities>",
  ].join("\n");
}

/**
 * End-to-end: parse the turn's references and build the injectable block.
 * Returns "" when the message names no entities (nothing to inject).
 */
export async function buildReferencedEntitiesBlock(opts: {
  userId: string;
  input: string;
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    content: string | Array<{ type: string; [k: string]: unknown }>;
  }>;
}): Promise<string> {
  const refs = collectReferencesForResolution(
    opts.input,
    historyUserTextsNewestFirst(opts.messages),
  );
  if (refs.length === 0) return "";
  const resolved = await resolveReferences(opts.userId, refs);
  return formatReferencedEntitiesBlock(resolved);
}
