"use client";

/**
 * In-document @JARVIS inline pill (Phase 32, JDOC-UX-02/03/04/06).
 *
 * A BlockNote CUSTOM INLINE CONTENT type (`jarvisReceipt`) that carries an
 * @JARVIS invocation through three visual states, all driven by its `status`
 * prop (persisted in content_json so the pill survives reload):
 *
 *   "prompt"  — the editable invocation text, neumorphic outlined pill, mono
 *               font. Cmd+Enter (wired in PageBlockEditor) submits it.
 *   "loading" — a spinner while invokeInDocumentJarvis runs.
 *   "receipt" — the summary line ("Created 1 task, ..."); hovering shows the
 *               original prompt via the title attribute (JDOC-UX-04).
 *   "error"   — the failure message, still hoverable for the prompt.
 *
 * EXPORT EXCLUSION (JDOC-UX-06): this is `content: "none"`, so BlockNote's
 * markdown mirror emits nothing for it — receipts never reach the markdown that
 * exports read. As defense-in-depth the editor's onChange also runs the mirror
 * through stripReceipts. The in-doc hide toggle is pure CSS (a data attribute on
 * the editor wrapper), independent of export.
 */

import { createReactInlineContentSpec } from "@blocknote/react";
import { Loader2 } from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

import { receiptToMarkdownComment } from "@/lib/jarvis/receipt-markdown";

/** The persisted prop schema for the pill. All BlockNote props are strings. */
export const JARVIS_RECEIPT_TYPE = "jarvisReceipt" as const;

// Re-export the pure markdown contract so callers can import it alongside the
// spec; the implementation lives in lib/jarvis/receipt-markdown.ts (testable).
export { receiptToMarkdownComment };

/**
 * The inline content spec. Registered in PageBlockEditor's schema. Props:
 *   - prompt:  the original user instruction (shown while editing, and as the
 *              receipt hover tooltip).
 *   - status:  "prompt" | "loading" | "receipt" | "error".
 *   - summary: the receipt summary line (set once the turn resolves).
 *   - turnId:  the persisted jarvis_turns id (for future deep-linking / undo).
 */
export const jarvisReceiptInlineSpec = createReactInlineContentSpec(
  {
    type: JARVIS_RECEIPT_TYPE,
    propSchema: {
      prompt: { default: "" },
      status: { default: "prompt" },
      summary: { default: "" },
      turnId: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { prompt, status, summary } = props.inlineContent.props;

      // Receipt + error states show the resolved line; hovering reveals the
      // original prompt (JDOC-UX-04). Prompt/loading states show the prompt.
      const isReceipt = status === "receipt";
      const isError = status === "error";
      const isLoading = status === "loading";

      const label = isReceipt
        ? summary || "No changes"
        : isError
          ? summary || "JARVIS failed"
          : prompt || "@Jarvis";

      return (
        <span
          className="bn-jarvis-pill"
          data-status={status}
          // Hover tooltip with the original prompt on resolved pills.
          title={isReceipt || isError ? prompt : undefined}
          contentEditable={false}
        >
          <span className="bn-jarvis-pill-icon" aria-hidden="true">
            {isLoading ? (
              <Loader2 size={12} strokeWidth={2} className="bn-jarvis-spin" />
            ) : (
              <KiwiIcon size={12} />
            )}
          </span>
          <span className="bn-jarvis-pill-label">{label}</span>
        </span>
      );
    },
  },
);
