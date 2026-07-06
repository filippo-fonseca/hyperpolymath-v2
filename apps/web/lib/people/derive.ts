/**
 * derive.ts — auto-derive LINKED PEOPLE from an entity's text.
 *
 * The people-side counterpart of lib/url.ts. Where `mergeContentUrls` scans a
 * capture body for bare links and additively indexes them, this module scans a
 * capture/task's text for references to PEOPLE the user already knows and links
 * them — the same "auto-assign from the body" lifecycle, centralized so every
 * write path (web action, JARVIS executor, device API, email) and the lazy
 * view-time backfill share one implementation and can't diverge.
 *
 * SMART references (issue): a bare "Anna" in the text should resolve to an
 * existing "Anna Parker" when that is confidently who is meant. Free-text entity
 * resolution is inherently ambiguous (unlike a regex URL match), so the match
 * step runs a cheap Haiku call:
 *
 *   - It is given the user's existing people (id + name) and the text, and
 *     returns the ids of the existing people confidently referenced.
 *   - When a reference is ambiguous or matches no existing person, it is LEFT
 *     UNRESOLVED — we never guess, and never silently create a wrong link.
 *   - Auto-derivation only ever LINKS TO EXISTING people. Creating a brand-new
 *     person is reserved for the explicit `@`-mention path (resolve-or-create),
 *     so free-text names never spam the people graph with wrong/partial entities.
 *
 * Everything here is fail-soft and runs OFF the critical write path (via
 * `after()`), mirroring `scheduleAutoTagging` / `scheduleLinkPreviews`: a failure
 * only means the entity keeps the people the user explicitly linked.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";

import { reconcilePersonReferencesForUser } from "@/app/actions/people";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { db } from "@/lib/db";
import { captures, people, peopleReferences, tasks } from "@/lib/db/schema";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/jarvis/anthropic-client";
import { z } from "zod";

/**
 * The entity types we auto-derive people for. A subset of the polymorphic
 * `people_references.from_type` values (we only scan free text; events/pages
 * are out of scope for this lifecycle).
 */
export type PeopleDerivationEntity = "capture" | "task";

/** Minimal person shape the matcher resolves against. */
export interface KnownPerson {
  id: string;
  name: string;
}

// Cap the roster handed to the model so the prompt stays bounded on users with
// large address books. The most-recently-updated slice is the likeliest to be
// referenced; anyone omitted is simply not auto-matched (the user can still
// `@`-mention them explicitly).
const MAX_PEOPLE_IN_PROMPT = 200;
// Hard cap on auto-links applied in one pass — a backstop against a misbehaving
// model response ever linking a wild number of people to one entity.
const MAX_MATCHES = 12;

const matchSchema = z.object({
  person_ids: z.array(z.string()).default([]),
});

const TOOL_NAME = "emit_person_matches";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    person_ids: {
      type: "array",
      description:
        "The ids of the EXISTING people (from the provided list) confidently referenced in the note. Empty when none are clearly referenced.",
      items: { type: "string", description: "An id copied verbatim from the provided people list." },
    },
  },
  required: ["person_ids"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  "You do entity resolution for a personal life-OS app. You are given a short note (a capture or a task) and the user's EXISTING people, each with an id and a name.",
  "",
  "GOAL: identify which of THOSE EXISTING PEOPLE are referenced in the note, and return their ids so they can be auto-linked.",
  "",
  "RULES:",
  "1. Only ever return ids that appear in the provided people list. Never invent an id or a person.",
  "2. A reference can be a full name, a first name, a last name, a nickname, or an unambiguous contextual mention (for example 'my sister' only if the list makes clear who that is). Match a partial reference like 'Anna' to an existing 'Anna Parker' ONLY when you are confident she is who is meant.",
  "3. If a reference is ambiguous (it could plausibly be more than one person, or you are not confident it refers to a specific existing person), OMIT it. Do not guess. Leaving a reference unresolved is the correct, safe answer.",
  "4. Do not match incidental words that merely look like names, roles with no clear referent, or the note's author themselves.",
  "5. Return an empty list when no existing person is clearly referenced.",
  "",
  "Always respond by calling the emit_person_matches tool. Do not write prose.",
].join("\n");

/**
 * Keep only ids that are actually in the user's roster, de-duplicated and
 * capped. The hard hallucination guard: whatever the model returns, we never
 * link an id the user does not own / that was not offered to the model.
 */
export function filterResolvedPersonIds(
  candidateIds: readonly string[],
  known: readonly KnownPerson[],
): string[] {
  const owned = new Set(known.map((p) => p.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of candidateIds) {
    if (!owned.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

/**
 * Resolve which of the user's EXISTING people are referenced in `content`.
 * Returns their ids (validated against `known` — hallucinated/unknown ids are
 * dropped). Fail-soft: returns `[]` for empty content, no BYOK key, no people,
 * or any error, so the background job never throws into a request path.
 */
export async function matchExistingPeopleInContent(
  userId: string,
  content: string,
  known: KnownPerson[],
): Promise<string[]> {
  const trimmed = content.trim();
  if (!trimmed || known.length === 0) return [];

  // Smart matching is an optional enhancement — degrade silently to no matches
  // when the user has no Anthropic key (mirrors suggest-tags / auto-tag).
  const apiKey = await getUserKeyOrNull(userId, "anthropic");
  if (!apiKey) return [];

  try {
    const client = getAnthropicClient(apiKey);
    const roster = known
      .slice(0, MAX_PEOPLE_IN_PROMPT)
      .map((p) => `- ${p.id}: ${p.name}`)
      .join("\n");

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Emit the ids of existing people referenced in the note. Always call this exactly once.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Existing people:\n${roster}\n\nNote:\n${trimmed}`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return [];
    const parsed = matchSchema.safeParse(toolUse.input);
    if (!parsed.success) return [];

    return filterResolvedPersonIds(parsed.data.person_ids, known);
  } catch (err) {
    console.error("[people-derive] matchExistingPeopleInContent failed; returning none", err);
    return [];
  }
}

const ENTITY_TABLE = { capture: captures, task: tasks } as const;

/** Load the user's people roster (id + name) for the matcher. */
async function loadKnownPeople(userId: string): Promise<KnownPerson[]> {
  return db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(sql`${people.updatedAt} DESC`);
}

/** The person ids currently linked to (entityType, entityId). */
async function loadCurrentReferences(
  userId: string,
  entityType: PeopleDerivationEntity,
  entityId: string,
): Promise<string[]> {
  const rows = await db
    .select({ personId: peopleReferences.personId })
    .from(peopleReferences)
    .where(
      and(
        eq(peopleReferences.userId, userId),
        eq(peopleReferences.fromType, entityType),
        eq(peopleReferences.fromId, entityId),
      ),
    );
  return rows.map((r) => r.personId);
}

/** Stamp the `people_derived_at` marker so the lazy view-time backfill fires at most once. */
async function markDerived(
  userId: string,
  entityType: PeopleDerivationEntity,
  entityId: string,
): Promise<void> {
  const table = ENTITY_TABLE[entityType];
  await db
    .update(table)
    .set({ peopleDerivedAt: sql`now()` })
    .where(and(eq(table.id, entityId), eq(table.userId, userId)));
}

export interface DeriveResult {
  /** True when at least one new person link was added by this pass. */
  changed: boolean;
  /** The full set of person ids linked to the entity after derivation. */
  personIds: string[];
}

/**
 * Derive + link people for one entity, ADDITIVELY. Loads the current references,
 * runs the smart matcher over the text, unions the confident matches on top
 * (never removing a link the user or a prior pass established — the people twin
 * of `mergeContentUrls`'s "never removes" guarantee), reconciles, and stamps the
 * `people_derived_at` marker. Fully awaited; callers decide sync-vs-background.
 */
export async function deriveEntityPeople(
  userId: string,
  entityType: PeopleDerivationEntity,
  entityId: string,
  content: string,
): Promise<DeriveResult> {
  const [known, existing] = await Promise.all([
    loadKnownPeople(userId),
    loadCurrentReferences(userId, entityType, entityId),
  ]);

  const matched = await matchExistingPeopleInContent(userId, content, known);

  const existingSet = new Set(existing);
  const additions = matched.filter((id) => !existingSet.has(id));

  if (additions.length > 0) {
    // ADD semantics: union with the current references so reconcile (which
    // REPLACES the set) never drops a link the user explicitly made.
    const desired = Array.from(new Set([...existing, ...matched]));
    await reconcilePersonReferencesForUser(userId, entityType, entityId, desired);
  }

  await markDerived(userId, entityType, entityId);

  return {
    changed: additions.length > 0,
    personIds: Array.from(new Set([...existing, ...matched])),
  };
}

/**
 * Schedule people derivation for an entity after the response is sent. Returns
 * immediately; the match + writes run via `after()` so they never delay the
 * write path, exactly like `scheduleAutoTagging` / `scheduleLinkPreviews`.
 * Safe to call from server actions and route handlers. Fail-soft: if there is
 * no active request scope to attach `after()` to (e.g. a non-request caller),
 * derivation is simply skipped rather than crashing the entity write.
 */
export function scheduleEntityPeopleDerivation(
  entityType: PeopleDerivationEntity,
  entityId: string,
  userId: string,
  content: string,
): void {
  if (!content.trim()) return;
  try {
    after(async () => {
      try {
        await deriveEntityPeople(userId, entityType, entityId, content);
      } catch (err) {
        console.error("[people-derive] background derivation failed", err);
      }
    });
  } catch (err) {
    console.error("[people-derive] could not schedule derivation", err);
  }
}

/**
 * Lazy view-time backfill for an entity's linked people — the people twin of
 * `ensureCaptureUrls`. Runs at most once per entity: guarded by the
 * `people_derived_at` marker so opening a capture/task never re-runs the Haiku
 * match after the first time (most entities are already derived at create/edit).
 *
 * Returns the (possibly unchanged) linked-people list so the caller can
 * reconcile its optimistic copy without a full refetch.
 */
export async function ensureEntityPeople(
  userId: string,
  entityType: PeopleDerivationEntity,
  entityId: string,
): Promise<{ people: KnownPerson[]; changed: boolean }> {
  const table = ENTITY_TABLE[entityType];
  const [row] = await db
    .select({ content: contentColumn(entityType), derivedAt: table.peopleDerivedAt })
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.userId, userId)))
    .limit(1);

  if (!row) return { people: [], changed: false };

  let changed = false;
  if (row.derivedAt == null) {
    const result = await deriveEntityPeople(userId, entityType, entityId, row.content ?? "");
    changed = result.changed;
  }

  // Return the entity's current linked people (post-derivation) for the caller.
  const linked = await db
    .select({ id: people.id, name: people.name })
    .from(peopleReferences)
    .innerJoin(people, eq(people.id, peopleReferences.personId))
    .where(
      and(
        eq(peopleReferences.userId, userId),
        eq(peopleReferences.fromType, entityType),
        eq(peopleReferences.fromId, entityId),
      ),
    );
  return { people: linked, changed };
}

/** The text column to scan for a given entity — capture body, or task title+notes. */
function contentColumn(entityType: PeopleDerivationEntity) {
  return entityType === "capture"
    ? captures.content
    : sql<string>`concat_ws(' ', ${tasks.title}, ${tasks.notes})`;
}
