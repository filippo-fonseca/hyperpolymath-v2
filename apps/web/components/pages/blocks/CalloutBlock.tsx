import { createReactBlockSpec } from "@blocknote/react";

/** Notion-style callout with a leading emoji and editable inline content. */
export const calloutBlock = createReactBlockSpec(
  {
    type: "callout",
    content: "inline",
    propSchema: { emoji: { default: "💡" } },
  },
  {
    render: (props) => (
      <div className="bn-callout">
        <span className="bn-callout-emoji" contentEditable={false}>
          {props.block.props.emoji}
        </span>
        <div className="bn-callout-body" ref={props.contentRef} />
      </div>
    ),
  }
)();
