"use client";

/**
 * In-document entity-reference chip (issue #9, "Zyndicate, finally").
 *
 * A BlockNote CUSTOM INLINE CONTENT type (`entityReference`) that renders a
 * non-editable inline chip linking a page to another app entity — an area,
 * project, task, or page. It is the wiki-link / @-mention analogue for app
 * entities, sibling to the existing personMention chip: a `content: "none"`
 * atom (it holds no inline children) so the cursor can never land inside it,
 * and it persists straight into the page's content_json via its props.
 *
 * Clicking the chip navigates to the referenced entity's canonical detail URL
 * via the shared entity-href map (the same one global search + JARVIS receipts
 * use), so "click a reference, land on it" behaves identically everywhere.
 *
 * Visual register mirrors the .bn-person-pill family so references read as kin
 * to person mentions, distinguished by a cyan accent (the JARVIS/HUD signature)
 * and a per-kind leading glyph instead of the amber "@".
 */

import { type EntityRef, entityHref } from "@/lib/entity-href";
import { createReactInlineContentSpec } from "@blocknote/react";

/** Stable inline-content type string registered in PageBlockEditor's schema. */
export const ENTITY_REFERENCE_TYPE = "entityReference" as const;

/** The non-person entity kinds a wiki page can reference. */
export type EntityReferenceKind = "area" | "project" | "task" | "page";

/** The chip's persisted props (mirror of the propSchema below). */
export interface EntityReferenceProps {
  /** Which kind of entity this points at — drives the glyph and the URL. */
  refKind: EntityReferenceKind;
  /** The referenced entity's id (drives the click-through URL). */
  refId: string;
  /** The entity's display label at insert time (the visible chip text). */
  label: string;
  /** A leading emoji where the entity carries one (areas/pages); "" otherwise. */
  emoji: string;
}

/** Per-kind fallback glyph shown when the entity has no emoji of its own. */
const KIND_GLYPH: Record<EntityReferenceKind, string> = {
  area: "◆",
  project: "▸",
  task: "✓",
  page: "¶",
};

/** Map a chip's props to the shared EntityRef so navigation matches the app. */
function toEntityRef(kind: EntityReferenceKind, id: string): EntityRef {
  return { kind, id };
}

/**
 * The inline content spec. Props:
 *   - refKind: the referenced entity's kind (area/project/task/page).
 *   - refId:   the referenced entity's id (drives the click-through URL).
 *   - label:   the display label captured at insert time.
 *   - emoji:   the entity's emoji, or "" to fall back to the per-kind glyph.
 */
export const entityReferenceInlineSpec = createReactInlineContentSpec(
  {
    type: ENTITY_REFERENCE_TYPE,
    propSchema: {
      refKind: { default: "page", values: ["area", "project", "task", "page"] },
      refId: { default: "" },
      label: { default: "" },
      emoji: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { refKind, refId, label, emoji } = props.inlineContent
        .props as EntityReferenceProps;
      const href = refId ? entityHref(toEntityRef(refKind, refId)) : undefined;
      const glyph = emoji || KIND_GLYPH[refKind];
      return (
        // A real anchor so it click-throughs and middle-clicks like any link.
        // contentEditable={false} keeps it an opaque atom inside the editor.
        <a
          className="bn-entity-ref"
          data-kind={refKind}
          contentEditable={false}
          href={href ?? "#"}
          title={`${refKind}: ${label}`}
          // Stop the editor from swallowing the click as a caret placement so a
          // plain click navigates. New-tab modifiers fall through to the anchor.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="bn-entity-ref-glyph" aria-hidden="true">
            {glyph}
          </span>
          <span className="bn-entity-ref-label">{label || "Untitled"}</span>
        </a>
      );
    },
  },
);
