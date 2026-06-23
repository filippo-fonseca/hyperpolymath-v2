"use client";

/**
 * In-document @-mention person pill (Phase C, People knowledge graph).
 *
 * A BlockNote CUSTOM INLINE CONTENT type (`personMention`) that renders a
 * non-editable inline pill carrying a reference to a person. The pill is a
 * `content: "none"` atom (it holds no BlockNote inline children) so the cursor
 * can never land inside it; it persists in content_json via its props, and the
 * editor extracts the set of `personId`s on save to reconcile people_references.
 *
 * Visual register mirrors the JARVIS receipt pill (.bn-jarvis-pill family) so
 * mentions read as kin to other inline pills, distinguished by the leading "@"
 * glyph and an amber accent rather than the cyan JARVIS one.
 */

import { createReactInlineContentSpec } from "@blocknote/react";

/** Stable inline-content type string registered in PageBlockEditor's schema. */
export const PERSON_MENTION_TYPE = "personMention" as const;

/** The pill's persisted props (mirror of the propSchema below). */
export interface PersonMentionProps {
  personId: string;
  name: string;
}

/**
 * The inline content spec. Props:
 *   - personId: the referenced person's id (drives save-time reconciliation).
 *   - name:     the person's display name at insert time (the visible label).
 */
export const personMentionInlineSpec = createReactInlineContentSpec(
  {
    type: PERSON_MENTION_TYPE,
    propSchema: {
      personId: { default: "" },
      name: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { name } = props.inlineContent.props as PersonMentionProps;
      return (
        <span className="bn-person-pill" contentEditable={false}>
          <span className="bn-person-pill-at" aria-hidden="true">
            @
          </span>
          <span className="bn-person-pill-label">{name || "Someone"}</span>
        </span>
      );
    },
  }
);
