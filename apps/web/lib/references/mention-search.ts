import type { EntityRefType } from "./token";

/**
 * The pure half of the universal @-mention picker.
 *
 * Lives outside app/actions/wiki-references.ts because a "use server" module
 * may only export async functions — every helper here would have to become a
 * server action to sit next to the action that uses them.
 */

/** One row the picker can insert. */
export interface EntityMentionCandidate {
  kind: EntityRefType;
  id: string;
  /** Display label. Captures have no title, so theirs is a synthesized first line. */
  label: string;
  /** Short context under the label: parent project, parent area, person email. */
  sublabel?: string;
  emoji?: string | null;
  /** ISO, for recency ordering. */
  updatedAt?: string;
}

export interface EntityMentionGroup {
  kind: EntityRefType;
  items: EntityMentionCandidate[];
}

export interface EntityMentionResults {
  groups: EntityMentionGroup[];
  query: string;
}

/**
 * Group order in the menu. Captures lead because they're the thing most often
 * being written about at the moment the picker opens.
 */
export const MENTION_KIND_ORDER: readonly EntityRefType[] = [
  "capture",
  "task",
  "page",
  "project",
  "area",
  "person",
] as const;

/** Cap per kind for a real query — six is what the shipped picker uses. */
export const MAX_PER_KIND = 6;

/** Cap per kind when the picker opens on a bare trigger with nothing typed. */
export const MAX_RECENT_PER_KIND = 4;

/**
 * Order the groups, drop the empty ones.
 *
 * An empty group is omitted rather than rendered as a bare header: a menu of
 * six headers over one result reads as broken.
 */
export function assembleMentionGroups(
  candidates: readonly EntityMentionCandidate[],
): EntityMentionGroup[] {
  const groups: EntityMentionGroup[] = [];
  for (const kind of MENTION_KIND_ORDER) {
    const items = candidates.filter((c) => c.kind === kind);
    if (items.length) groups.push({ kind, items });
  }
  return groups;
}

/**
 * Turn a raw picker query into a prefix tsquery, or null if nothing survives.
 *
 * Same idiom as searchCaptures (app/actions/captures.ts): every character that
 * isn't a letter, number, or underscore is dropped, so no to_tsquery operator
 * (`& | ! ( ) : *`) can reach the parser and turn a stray `(` into a syntax
 * error. Each surviving token gets `:*` so "marat" still finds "marathon" —
 * the picker searches while the user is mid-word, which is exactly the case
 * plain to_tsquery doesn't handle.
 *
 * Returns null for an all-punctuation query rather than letting
 * to_tsquery('english', '') run.
 */
export function toPrefixTsQuery(raw: string): string | null {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, ""))
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`);
  return tokens.length ? tokens.join(" & ") : null;
}

/** Escape a value for a LIKE pattern, so `%` and `_` match literally. */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}
