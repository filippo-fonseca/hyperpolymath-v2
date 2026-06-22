/**
 * Deterministic per-block content hashing for Daily Page re-processing
 * (issue #92 part 5).
 *
 * The "Process this page" button runs a Daily Page through the in-document
 * JARVIS engine to extract tasks/events/captures. Without a snapshot, pressing
 * it twice would double-create everything. These pure helpers let the client
 * hash each top-level block, persist the snapshot per processing run, and on the
 * next run send ONLY the blocks that are new or changed since the last snapshot.
 *
 * Framework-free and synchronous so it's trivially unit-testable and cheap to
 * run on every Process click. The hash is content-only (block type + props +
 * inline content + children, recursively): the block id is the MAP KEY, not part
 * of the hash, so the hash answers "did this block's content change", and a
 * change anywhere in a block's subtree changes its top-level hash.
 */

import type { ResolverBlock } from "@/lib/jarvis/scope-resolver";

/** A snapshot: stable block id -> content hash. */
export type BlockHashes = Record<string, string>;

/**
 * Stable JSON: serialize with object keys sorted so logically-equal blocks
 * always produce the same string regardless of key insertion order. Arrays keep
 * their order (document order is meaningful).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** FNV-1a 32-bit, returned as 8-char hex. Fast, deterministic, dependency-free. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Content hash for a single block (type + props + content + children subtree).
 * The block's own id is deliberately excluded so the hash tracks content, not
 * identity.
 */
export function hashBlock(block: ResolverBlock): string {
  return fnv1a(
    stableStringify({
      type: block.type,
      props: block.props ?? null,
      content: block.content ?? null,
      children: Array.isArray(block.children)
        ? block.children.map((c) => stableStringify({ id: c.id, h: hashBlock(c) }))
        : null,
    }),
  );
}

/** Snapshot every TOP-LEVEL block as { id -> content hash }. */
export function computeBlockHashes(document: ResolverBlock[]): BlockHashes {
  const out: BlockHashes = {};
  for (const block of document) {
    if (block?.id) out[block.id] = hashBlock(block);
  }
  return out;
}

export interface BlockHashDiff {
  /** Blocks present now that are new or whose hash changed since `prev`. */
  changedBlockIds: string[];
  /** Blocks present now whose hash is unchanged since `prev`. */
  unchangedBlockIds: string[];
}

/**
 * Diff the current snapshot against the previous run's snapshot. Only considers
 * blocks that exist NOW (`next`): a block is "changed" when it's absent from
 * `prev` or its hash differs. Blocks deleted since `prev` are ignored — there's
 * nothing left to process. With no previous snapshot, every current block counts
 * as changed (first run processes the whole page).
 */
export function diffBlockHashes(
  prev: BlockHashes | null | undefined,
  next: BlockHashes,
): BlockHashDiff {
  const prior = prev ?? {};
  const changedBlockIds: string[] = [];
  const unchangedBlockIds: string[] = [];
  for (const [id, hash] of Object.entries(next)) {
    if (prior[id] === hash) unchangedBlockIds.push(id);
    else changedBlockIds.push(id);
  }
  return { changedBlockIds, unchangedBlockIds };
}
