/**
 * In-document @JARVIS scope resolver (Phase 31, JDOC-ENGINE-02).
 *
 * Pure, framework-free: takes a structural snapshot of the BlockNote document
 * (NOT a live editor instance), the cursor block id, and an optional prompt,
 * and returns a {@link ScopeTarget} describing what the invocation acts on.
 *
 * Scope-to-content mapping (D-04 — there is no native BlockNote "section" node):
 *   - block     = the single block at the cursor (DEFAULT per JDOC-ENGINE-02).
 *   - sub-block  = the cursor block's children.
 *   - section    = from the nearest preceding heading at-or-above the cursor
 *                  through all following TOP-LEVEL blocks until the next heading
 *                  of EQUAL-OR-HIGHER level. Heading level is read from
 *                  props.level (default 1; lower number = higher level), so a
 *                  level-1 section absorbs intervening level-2/3 sub-headings
 *                  and stops only at the next level-1 (or higher) heading.
 *   - page       = every top-level block in the document.
 *
 * Smart inference (D-03) is a DEFAULT-PICKER layered on top of the block
 * default, never a hard override: it can upgrade the default to section /
 * sub-block / page based on an empty trailing block or prompt phrasing, but the
 * resolver always returns an explicit, overrideable target.
 */

/**
 * Minimal structural block shape — deliberately NOT the heavy BlockNote generic
 * Block type, so this module imports nothing from @blocknote and stays trivially
 * unit-testable with plain fixtures.
 */
export type ResolverBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: ResolverBlock[];
};

export type ScopeKind = "block" | "sub-block" | "section" | "page";

export interface ScopeTarget {
  kind: ScopeKind;
  /** The cursor block id (when kind is block/sub-block/section anchored to it). */
  blockId?: string;
  /** The section's anchoring heading block id (kind === "section"). */
  headingId?: string;
  /** The concrete block ids this scope serializes. Never empty. */
  blockIds: string[];
}

/** Read a heading's level from props.level; default 1 (highest). */
function headingLevel(block: ResolverBlock): number {
  const raw = block.props?.level;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function isHeading(block: ResolverBlock): boolean {
  return block.type === "heading";
}

/** True when a block carries no renderable text content. */
function isEmptyBlock(block: ResolverBlock): boolean {
  const c = block.content;
  if (c == null) return true;
  if (typeof c === "string") return c.trim().length === 0;
  if (Array.isArray(c)) {
    if (c.length === 0) return true;
    // BlockNote inline content: array of { type, text, ... }
    return c.every((node) => {
      const t = (node as { text?: unknown })?.text;
      return typeof t !== "string" || t.trim().length === 0;
    });
  }
  return false;
}

function findTopLevelIndex(document: ResolverBlock[], blockId: string): number {
  return document.findIndex((b) => b.id === blockId);
}

/**
 * Compute the section range anchored at the nearest preceding heading
 * (at-or-before the cursor in top-level order). Returns null when there is no
 * preceding heading (caller falls back to page).
 */
function resolveSection(
  document: ResolverBlock[],
  cursorIndex: number,
): { headingId: string; blockIds: string[] } | null {
  // Nearest heading at-or-before the cursor.
  let headingIndex = -1;
  for (let i = cursorIndex; i >= 0; i--) {
    if (isHeading(document[i]!)) {
      headingIndex = i;
      break;
    }
  }
  if (headingIndex === -1) return null;

  const heading = document[headingIndex]!;
  const level = headingLevel(heading);
  const blockIds: string[] = [heading.id];
  // Walk forward until the next heading of equal-or-higher level.
  for (let i = headingIndex + 1; i < document.length; i++) {
    const b = document[i]!;
    if (isHeading(b) && headingLevel(b) <= level) break;
    blockIds.push(b.id);
  }
  return { headingId: heading.id, blockIds };
}

function pageTarget(document: ResolverBlock[]): ScopeTarget {
  return { kind: "page", blockIds: document.map((b) => b.id) };
}

const PROMPT_SCOPE_RE =
  /\b(this|these|the)\s+(list|section|page|whole\s+page|document|above|everything)\b/i;

/**
 * Resolve what an in-document @JARVIS invocation targets.
 *
 * @param document     Top-level block snapshot (editor.document).
 * @param cursorBlockId The block the cursor sits in, or null.
 * @param prompt       The raw user prompt (drives smart inference).
 */
export function resolveScope(
  document: ResolverBlock[],
  cursorBlockId: string | null,
  prompt?: string,
): ScopeTarget {
  // No cursor / unknown block -> whole page (safe default).
  if (!cursorBlockId) return pageTarget(document);
  const cursorIndex = findTopLevelIndex(document, cursorBlockId);
  if (cursorIndex === -1) return pageTarget(document);

  const cursorBlock = document[cursorIndex]!;

  // ---- Smart inference (default-picker, D-03) -----------------------------
  const m = prompt ? PROMPT_SCOPE_RE.exec(prompt) : null;
  if (m) {
    const noun = m[2]!.toLowerCase().replace(/\s+/g, " ");
    if (noun === "page" || noun === "whole page" || noun === "document" || noun === "everything") {
      return pageTarget(document);
    }
    if (noun === "section" || noun === "above") {
      const section = resolveSection(document, cursorIndex);
      if (section) {
        return {
          kind: "section",
          blockId: cursorBlockId,
          headingId: section.headingId,
          blockIds: section.blockIds,
        };
      }
      return pageTarget(document);
    }
    if ((noun === "list" || noun === "these") && (cursorBlock.children?.length ?? 0) > 0) {
      return {
        kind: "sub-block",
        blockId: cursorBlockId,
        blockIds: cursorBlock.children!.map((c) => c.id),
      };
    }
    // "this/the list" with no children, or "these" with no children: fall
    // through to the block default rather than returning an empty target.
  }

  // Empty trailing block of a section -> prefer the enclosing section (D-03).
  if (isEmptyBlock(cursorBlock)) {
    const section = resolveSection(document, cursorIndex);
    if (section) {
      const isTrailing = section.blockIds[section.blockIds.length - 1] === cursorBlockId;
      if (isTrailing) {
        return {
          kind: "section",
          blockId: cursorBlockId,
          headingId: section.headingId,
          blockIds: section.blockIds,
        };
      }
    }
  }

  // ---- Block default (JDOC-ENGINE-02) -------------------------------------
  return {
    kind: "block",
    blockId: cursorBlockId,
    blockIds: [cursorBlockId],
  };
}
