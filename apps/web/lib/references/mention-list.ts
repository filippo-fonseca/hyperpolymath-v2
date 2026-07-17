/**
 * The pure shape of the universal @-mention menu.
 *
 * The suggestion plugin's contract is a FLAT `items` array plus `command(item)`,
 * and the shipped keyboard contract wraps the selection `mod items.length`. So
 * the menu's grouping is a render-time concern only: `flattenMentionGroups`
 * produces the flat, ordered option list the keyboard walks, and
 * `mentionRows` re-derives the headers for display. Headers are therefore
 * unselectable by construction rather than by a skip-the-header special case.
 */

import type {
  EntityMentionCandidate,
  EntityMentionGroup,
} from "./mention-search";
import type { EntityRef, EntityRefType } from "./token";

/**
 * One selectable row.
 *
 * `isCreatePerson` marks the sentinel: a person the user named but who does not
 * exist yet. It carries no id, because there is nothing to point at until the
 * save path resolves-or-creates by name — which is exactly the flow the
 * captures composer has shipped since Phase C, and which this menu must not
 * break.
 */
export interface EntityMentionOption extends EntityMentionCandidate {
  isCreatePerson?: boolean;
}

/** The sentinel's synthetic id. Never reaches the DB; never becomes a token. */
export const CREATE_PERSON_ID = "__create_person__";

/** True when this option must insert a legacy name-carrying person node. */
export function isCreatePersonOption(option: EntityMentionOption): boolean {
  return option.isCreatePerson === true;
}

/**
 * Flatten grouped results into the keyboard's flat option list.
 *
 * `createPersonName` appends the "Create person" sentinel to the end of the
 * person group (creating that group when the user has no person matches at
 * all). It is omitted when the typed name already matches a person exactly —
 * offering "Create Ada" under an existing Ada is how you get two Adas.
 */
export function flattenMentionGroups(
  groups: readonly EntityMentionGroup[],
  opts: { createPersonName?: string } = {},
): EntityMentionOption[] {
  const out: EntityMentionOption[] = [];
  let sawPeople = false;

  for (const group of groups) {
    if (group.kind === "person") sawPeople = true;
    for (const item of group.items) out.push(item);
    if (group.kind === "person") {
      const sentinel = buildCreatePersonOption(group.items, opts.createPersonName);
      if (sentinel) out.push(sentinel);
    }
  }

  // No person group came back at all (nothing matched) — the sentinel is the
  // only reason the person section would exist, and it's the case that matters
  // most: you type a brand-new name precisely when nobody matches it.
  if (!sawPeople) {
    const sentinel = buildCreatePersonOption([], opts.createPersonName);
    if (sentinel) out.push(sentinel);
  }

  return out;
}

function buildCreatePersonOption(
  existing: readonly EntityMentionCandidate[],
  rawName: string | undefined,
): EntityMentionOption | null {
  const name = rawName?.trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  if (existing.some((p) => p.label.toLowerCase() === lower)) return null;
  return {
    kind: "person",
    id: CREATE_PERSON_ID,
    label: name,
    isCreatePerson: true,
  };
}

/** A render row: either a sticky kind header or an option at a flat index. */
export type MentionRow =
  | { type: "header"; kind: EntityRefType }
  | { type: "option"; option: EntityMentionOption; index: number };

/**
 * Re-derive headers from the flat list by watching the kind change.
 *
 * Reading the headers off the flat array (rather than off the original groups)
 * guarantees the rendered order and the keyboard's order cannot drift apart:
 * there is one array, and the index in each row IS the selection index.
 */
export function mentionRows(
  options: readonly EntityMentionOption[],
): MentionRow[] {
  const rows: MentionRow[] = [];
  let lastKind: EntityRefType | null = null;
  options.forEach((option, index) => {
    if (option.kind !== lastKind) {
      rows.push({ type: "header", kind: option.kind });
      lastKind = option.kind;
    }
    rows.push({ type: "option", option, index });
  });
  return rows;
}

/**
 * The ref an option inserts, or null for the create-person sentinel (which has
 * no entity to point at yet).
 */
export function optionToRef(option: EntityMentionOption): EntityRef | null {
  if (isCreatePersonOption(option)) return null;
  return { type: option.kind, id: option.id, label: option.label };
}

/** Human-readable group headings, in the journal register (sentence case). */
export const MENTION_KIND_LABEL: Record<EntityRefType, string> = {
  capture: "Captures",
  task: "Tasks",
  page: "Pages",
  project: "Projects",
  area: "Areas",
  person: "People",
};

/**
 * The fallback glyph for a kind, shown when the entity has no emoji of its own.
 *
 * `area`/`project`/`task`/`page` are copied verbatim from the shipped map in
 * EntityReferenceInline.tsx — the wiki already teaches these four shapes, and a
 * task that is `✓` in a page but `☑` in the menu is a bug the user reads as
 * two different things. `capture` and `person` are new: `◇` is the open
 * counterpart of area's filled `◆`, and `@` needs no explanation.
 */
export const MENTION_KIND_GLYPH: Record<EntityRefType, string> = {
  capture: "◇",
  task: "✓",
  page: "¶",
  project: "▸",
  area: "◆",
  person: "@",
};
