// Issue #165 — shared types + value coercion for Notion-style page custom fields.
// The DB stores every value in a single jsonb column; this module is the single
// source of truth for how each field type maps to that stored representation, so
// the server action and the UI editors never disagree.
import type { PageFieldSelectOption } from "@/lib/db/schema";

export type { PageFieldSelectOption };

export type PageFieldType = "text" | "number" | "date" | "select" | "checkbox";

/** A definition is wiki-wide (every page) or folder-scoped (cascades to a
 * top-level folder's descendant pages). */
export type PageFieldScope = "wiki" | "folder";

export const FIELD_TYPE_ORDER: readonly PageFieldType[] = [
  "text",
  "number",
  "date",
  "select",
  "checkbox",
] as const;

export const FIELD_TYPE_LABELS: Record<PageFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select / tags",
  checkbox: "Checkbox",
};

/** A field definition, camelCased from the DB row. Reused across pages. */
export interface PageFieldDefinition {
  id: string;
  name: string;
  type: PageFieldType;
  scope: PageFieldScope;
  /** Set only for scope = 'folder': the top-level folder this def belongs to. */
  folderId: string | null;
  options: PageFieldSelectOption[] | null;
  allowMultiple: boolean;
  orderIndex: number;
}

/**
 * The stored value union.
 * - text, date → string
 * - number → number
 * - checkbox → boolean
 * - select → string[] of option ids (single-select is length ≤ 1)
 * - unset → null
 */
export type PageFieldValue = string | number | boolean | string[] | null;

/** A definition joined with a single page's value + per-page hidden override. */
export interface PageFieldWithValue extends PageFieldDefinition {
  value: PageFieldValue;
  /** True = hidden on this page (per-page override). Default false (visible). */
  hidden: boolean;
}

// ─── Select option colors ────────────────────────────────────────────────────
// Dynamic Tailwind class names get purged, so tag chips use inline styles keyed
// by a stable palette name. Subtle, paper-friendly tints that read in light+dark.
export interface TagColorStyle {
  bg: string;
  fg: string;
  border: string;
}

export const TAG_PALETTE: Record<string, TagColorStyle> = {
  slate: { bg: "rgba(100,116,139,0.14)", fg: "rgb(71,85,105)", border: "rgba(100,116,139,0.30)" },
  red: { bg: "rgba(239,68,68,0.14)", fg: "rgb(185,28,28)", border: "rgba(239,68,68,0.30)" },
  amber: { bg: "rgba(245,158,11,0.16)", fg: "rgb(180,83,9)", border: "rgba(245,158,11,0.32)" },
  green: { bg: "rgba(34,197,94,0.14)", fg: "rgb(21,128,61)", border: "rgba(34,197,94,0.30)" },
  teal: { bg: "rgba(20,184,166,0.14)", fg: "rgb(15,118,110)", border: "rgba(20,184,166,0.30)" },
  blue: { bg: "rgba(59,130,246,0.14)", fg: "rgb(29,78,216)", border: "rgba(59,130,246,0.30)" },
  purple: { bg: "rgba(168,85,247,0.14)", fg: "rgb(126,34,206)", border: "rgba(168,85,247,0.30)" },
  pink: { bg: "rgba(236,72,153,0.14)", fg: "rgb(190,24,93)", border: "rgba(236,72,153,0.30)" },
};

const TAG_COLOR_KEYS = Object.keys(TAG_PALETTE);

export function tagColorStyle(color?: string): TagColorStyle {
  return (color && TAG_PALETTE[color]) || TAG_PALETTE.slate;
}

/** Cycle the palette so successive new options get distinct colors. */
export function nextTagColor(existing: readonly PageFieldSelectOption[]): string {
  return TAG_COLOR_KEYS[existing.length % TAG_COLOR_KEYS.length];
}

/** Cross-runtime id (browser + Node 20). */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Walk up parentById to the top-level folder (parentId === null). Folder-scoped
 * field defs live only on top-level folders and cascade to descendants, so a
 * page's folder props come from its root-ancestor folder. Cycle-safe; returns
 * null when folderId is null.
 */
export function rootFolderId(
  folderId: string | null,
  parentById: Map<string, string | null>,
): string | null {
  if (!folderId) return null;
  let current: string | null = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent: string | null = parentById.get(current) ?? null;
    if (parent === null) return current;
    current = parent;
  }
  return current;
}

/**
 * Normalize a raw value into the stored representation for a field type. Returns
 * null for empty/invalid input so "cleared" and "never set" collapse to one
 * state. The single source of truth for both the server action and the editors.
 */
export function coerceFieldValue(
  type: PageFieldType,
  allowMultiple: boolean,
  raw: unknown,
): PageFieldValue {
  switch (type) {
    case "text": {
      if (typeof raw !== "string") return null;
      const trimmed = raw.trim();
      return trimmed === "" ? null : trimmed.slice(0, 2000);
    }
    case "number": {
      if (raw === null || raw === undefined || raw === "") return null;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "date": {
      if (typeof raw !== "string") return null;
      // Accept only a yyyy-MM-dd calendar date (what <input type="date"> emits).
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    }
    case "checkbox":
      return raw === true;
    case "select": {
      const arr = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string")
        : typeof raw === "string" && raw !== ""
          ? [raw]
          : [];
      const capped = allowMultiple ? arr : arr.slice(0, 1);
      return capped.length === 0 ? null : capped;
    }
    default:
      return null;
  }
}

/** Read a value as the option-id array a select editor works with. */
export function asSelectIds(value: PageFieldValue): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value !== "") return [value];
  return [];
}
