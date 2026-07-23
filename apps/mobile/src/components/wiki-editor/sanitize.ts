// Sanitize incoming BlockNote document JSON to the DEFAULT schema.
//
// apps/web authors pages with a custom schema (callout / linkEmbed blocks;
// person-mention, entity-reference, jarvis-receipt inline content). The mobile
// editor mounts the DEFAULT BlockNote schema — and BlockNote THROWS at creation
// if `initialContent` contains a block or inline type its schema doesn't know.
//
// This pure transform walks the document and coerces anything the default
// schema can't render into something it can, so a web-authored page opens on
// the phone instead of crashing:
//   - unknown BLOCK types  → a paragraph carrying whatever inline text survived
//   - unknown INLINE types → a text run built from a best-effort label prop
// Known default nodes pass through untouched, so round-trip fidelity for
// content the mobile editor itself produces is exact.
//
// Dependency-free (no @blocknote import) so it runs in both the native and the
// 'use dom' web bundle, and is trivially unit-testable.

/** Default BlockNote block types (v0.51 default schema). */
const KNOWN_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "codeBlock",
  "table",
  "image",
  "video",
  "audio",
  "file",
]);

/** Default BlockNote inline content types. */
const KNOWN_INLINE_TYPES = new Set(["text", "link"]);

/** Props keys we'll pull a display string from when demoting a custom inline. */
const LABEL_PROP_KEYS = ["label", "text", "title", "name", "prompt", "summary"];

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Build a plain text inline node, preserving styles when present. */
function textNode(text: string, styles?: unknown): Json {
  return { type: "text", text, styles: isObject(styles) ? styles : {} };
}

/** Best-effort display string for an unknown inline node. */
function labelForUnknownInline(node: Json): string {
  const props = isObject(node.props) ? node.props : node;
  for (const key of LABEL_PROP_KEYS) {
    const val = props[key];
    if (typeof val === "string" && val.trim()) return val;
  }
  return "";
}

/**
 * Sanitize an inline-content array (a block's `content` when it's a list of
 * inline nodes). Table content and string content are handled by the caller.
 */
function sanitizeInline(content: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const raw of content) {
    if (typeof raw === "string") {
      out.push(textNode(raw));
      continue;
    }
    if (!isObject(raw)) continue;
    const type = typeof raw.type === "string" ? raw.type : "text";
    if (KNOWN_INLINE_TYPES.has(type)) {
      if (type === "link" && Array.isArray(raw.content)) {
        // A link's content is itself inline text; keep it sanitized.
        out.push({ ...raw, content: sanitizeInline(raw.content) });
      } else {
        out.push(raw);
      }
      continue;
    }
    // Unknown inline (mention / reference / receipt) → keep its label as text.
    const label = labelForUnknownInline(raw);
    if (label) out.push(textNode(label));
  }
  return out;
}

/** Sanitize a block's `content` field, whatever shape it takes. */
function sanitizeContent(content: unknown): unknown {
  if (content === undefined || content === null) return content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return sanitizeInline(content);
  // Table content or other object shapes — pass through (default schema owns
  // "table"); non-table objects on a demoted block are dropped by the caller.
  return content;
}

function sanitizeBlock(raw: unknown): Json | null {
  if (!isObject(raw)) return null;
  const type = typeof raw.type === "string" ? raw.type : "paragraph";
  const children = Array.isArray(raw.children) ? sanitizeBlocks(raw.children) : undefined;

  if (KNOWN_BLOCK_TYPES.has(type)) {
    const block: Json = { ...raw, type };
    if ("content" in raw) block.content = sanitizeContent(raw.content);
    if (children) block.children = children;
    return block;
  }

  // Unknown block (callout / linkEmbed / …) → demote to a paragraph, salvaging
  // any inline text. Drop custom props (they belong to a schema we don't have).
  const salvaged = Array.isArray(raw.content) ? sanitizeInline(raw.content) : [];
  const paragraph: Json = { type: "paragraph", content: salvaged };
  if (children && children.length > 0) paragraph.children = children;
  return paragraph;
}

/**
 * Sanitize a full BlockNote document (array of blocks) to the default schema.
 * Returns a new array; never mutates the input. Non-array / empty → `[]`.
 */
export function sanitizeBlocks(doc: unknown): unknown[] {
  if (!Array.isArray(doc)) return [];
  const out: unknown[] = [];
  for (const block of doc) {
    const clean = sanitizeBlock(block);
    if (clean) out.push(clean);
  }
  return out;
}

/**
 * True when the incoming JSON carries any node type the default schema can't
 * render natively — i.e. sanitize would alter it. Useful for logging /
 * surfacing the "some content simplified" affordance.
 */
export function hasUnknownNodes(doc: unknown): boolean {
  if (!Array.isArray(doc)) return false;
  for (const block of doc) {
    if (!isObject(block)) continue;
    const type = typeof block.type === "string" ? block.type : "paragraph";
    if (!KNOWN_BLOCK_TYPES.has(type)) return true;
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        if (!isObject(inline)) continue;
        const itype = typeof inline.type === "string" ? inline.type : "text";
        if (!KNOWN_INLINE_TYPES.has(itype)) return true;
      }
    }
    if (Array.isArray(block.children) && hasUnknownNodes(block.children)) return true;
  }
  return false;
}
