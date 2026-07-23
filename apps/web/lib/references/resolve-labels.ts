import { type EntityRefType, ENTITY_REF_TYPES } from "./token";

/**
 * The pure half of batch label resolution.
 *
 * Lives outside app/actions/wiki-references.ts for the same reason
 * mention-search.ts does: a "use server" module may only export async
 * functions, so every helper here would otherwise have to become a server
 * action. It is also the half worth unit-testing — the SQL is not.
 *
 * Why batch at all: a token carries a label snapshot, but the live entity is
 * the truth. Rendering N pills means resolving N entities, and a per-pill
 * fetch turns one capture card into a dozen round trips. Everything here
 * exists to collapse a render tree's worth of pills into a single call.
 */

/** One entity a pill needs resolved. The label snapshot is not sent — only identity. */
export interface EntityLabelRequest {
  type: EntityRefType;
  id: string;
}

/**
 * What the server knows about one referenced entity.
 *
 * `exists: false` is a real answer, not an error: the target was deleted and
 * the pill must render as a tombstone. Its `label` is empty — the caller falls
 * back to the token's snapshot, which is the only name that entity has left.
 */
export interface ResolvedEntityLabel {
  type: EntityRefType;
  id: string;
  /** The live label. Empty when `exists` is false. */
  label: string;
  exists: boolean;
  /** Short context under the label: parent project, parent area, person email. */
  sublabel?: string;
  emoji?: string | null;
  /** 1-2 lines of body text for the hover preview card. */
  context?: string;
}

/**
 * Ceiling on entities resolved per call.
 *
 * A render tree with more than a hundred distinct pills is a pathological
 * page, not a use case; the cap keeps a hostile or looping caller from turning
 * one action into an unbounded fan-out of `in (...)` lists. Overflow is
 * dropped rather than erroring — those pills keep their snapshot labels, which
 * is a graceful degradation, not a failure.
 */
export const RESOLVE_LABELS_CAP = 100;

/** Max characters of body text carried back for a hover preview. */
export const CONTEXT_MAX = 160;

/** The cache/lookup key for one resolved entity. */
export function entityLabelKey(type: EntityRefType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Dedupe by identity, drop malformed rows, cap the total.
 *
 * Dedupe matters more than it looks: the same entity referenced five times in
 * one capture is one row to resolve, and five identical `in` list members
 * would otherwise be five wasted comparisons and five cache keys for one fact.
 */
export function normalizeLabelRequests(
  refs: readonly EntityLabelRequest[],
  cap: number = RESOLVE_LABELS_CAP,
): EntityLabelRequest[] {
  const seen = new Set<string>();
  const out: EntityLabelRequest[] = [];
  for (const ref of refs) {
    if (!ref || typeof ref.id !== "string" || !ref.id) continue;
    if (!(ENTITY_REF_TYPES as readonly string[]).includes(ref.type)) continue;
    const key = entityLabelKey(ref.type, ref.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: ref.type, id: ref.id });
    if (out.length >= cap) break;
  }
  return out;
}

/** Bucket ids by kind, so each table is queried once with one `in` list. */
export function groupIdsByType(
  refs: readonly EntityLabelRequest[],
): Record<EntityRefType, string[]> {
  const out = {} as Record<EntityRefType, string[]>;
  for (const kind of ENTITY_REF_TYPES) out[kind] = [];
  for (const ref of refs) out[ref.type].push(ref.id);
  return out;
}

/**
 * A stable key for the set of refs a render tree wants.
 *
 * Sorted, so two components asking for the same entities in different orders
 * share one cache entry and one request instead of racing two.
 */
export function labelRequestCacheKey(
  refs: readonly EntityLabelRequest[],
): string {
  return normalizeLabelRequests(refs)
    .map((r) => entityLabelKey(r.type, r.id))
    .sort()
    .join(",");
}

/**
 * Condense body text into the hover card's context line.
 *
 * `skipFirstLine` exists for captures: their label already *is* the first
 * line, so repeating it in the preview would show the same words twice.
 */
export function previewContext(
  body: string | null | undefined,
  opts: { skipFirstLine?: boolean; max?: number } = {},
): string | undefined {
  if (!body) return undefined;
  const max = opts.max ?? CONTEXT_MAX;
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const rest = opts.skipFirstLine ? lines.slice(1) : lines;
  const joined = rest.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return undefined;
  if (joined.length <= max) return joined;
  return `${joined.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Fold resolved rows into a lookup, then answer for every requested ref.
 *
 * Every request gets a row back, present or not: a missing answer and a
 * deleted entity are the same thing to a pill, and making the server say so
 * explicitly keeps the client from having to guess which it was.
 */
export function assembleResolvedLabels(
  requests: readonly EntityLabelRequest[],
  found: readonly ResolvedEntityLabel[],
): ResolvedEntityLabel[] {
  const byKey = new Map<string, ResolvedEntityLabel>();
  for (const row of found) byKey.set(entityLabelKey(row.type, row.id), row);
  return requests.map(
    (req) =>
      byKey.get(entityLabelKey(req.type, req.id)) ?? {
        type: req.type,
        id: req.id,
        label: "",
        exists: false,
      },
  );
}
