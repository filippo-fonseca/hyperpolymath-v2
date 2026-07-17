/**
 * The glyph each entity kind wears in a reference chip.
 *
 * Split out of EntityReferenceInline (where the first four were born) so every
 * surface that draws a reference — the wiki's BlockNote chip, the TipTap pill,
 * the transcript, a suggestion row — reads from one map. A kind that renders as
 * a diamond in the editor and something else in the transcript is the same
 * entity wearing two faces, which is exactly the confusion chips exist to
 * prevent.
 *
 * Pure and dependency-free on purpose: a suggestion list rendering server-side
 * and an inline spec rendering in the editor both need this, and neither should
 * have to drag React or the DB layer along to get it.
 *
 * The four original marks are typographic rather than pictographic, which is
 * what lets them sit inline at 0.82em without fighting the prose around them.
 */

import type { EntityRefType } from "./token";

/**
 * Kind → its leading glyph.
 *
 * `person` is "@" to match the shipped `.bn-person-pill-at` glyph exactly: a
 * person referenced in an old document (a `personMention` node) and one
 * referenced in a new one (an `entityReference` node) must read identically, or
 * the migration to the universal node becomes visible to the user as a
 * cosmetic split.
 *
 * `capture` breaks the typographic pattern on purpose. The obvious mark for it
 * is "◇", but `area` is already "◆" — the two would differ by fill alone, which
 * at this size is not a distinction a reader can rely on. A pencil is
 * unambiguous at any size and reads as the jotted note a capture is.
 */
export const ENTITY_KIND_GLYPH: Record<EntityRefType, string> = {
  capture: "✎",
  task: "✓",
  page: "¶",
  project: "▸",
  area: "◆",
  person: "@",
};

/** Human-readable singular name per kind, for tooltips and group headers. */
export const ENTITY_KIND_LABEL: Record<EntityRefType, string> = {
  capture: "Capture",
  task: "Task",
  page: "Page",
  project: "Project",
  area: "Area",
  person: "Person",
};

/** Plural kind name, for the grouped picker's section headers. */
export const ENTITY_KIND_PLURAL: Record<EntityRefType, string> = {
  capture: "Captures",
  task: "Tasks",
  page: "Pages",
  project: "Projects",
  area: "Areas",
  person: "People",
};
