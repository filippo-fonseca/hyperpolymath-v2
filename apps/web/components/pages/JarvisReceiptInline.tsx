"use client";

/**
 * In-document @JARVIS inline pill (Phase 32, JDOC-UX-02/03/04/06).
 *
 * A BlockNote CUSTOM INLINE CONTENT type (`jarvisReceipt`) that carries an
 * @JARVIS invocation through four visual states, all driven by its `status`
 * prop (persisted in content_json so the pill survives reload):
 *
 *   "prompt"  — an EDITABLE neumorphic mono pill. The user types their message
 *               INSIDE a controlled <input> (so it can never leak into the
 *               surrounding block, and Enter never splits the paragraph).
 *               Cmd/Ctrl+Enter submits.
 *   "loading" — a spinner while invokeInDocumentJarvis runs; editing disabled.
 *   "receipt" — the summary line ("Created 1 task, ..."); hovering shows the
 *               original prompt via the title attribute (JDOC-UX-04).
 *   "error"   — the failure message, still hoverable for the prompt.
 *
 * BLOCKNOTE MECHANICS: the node is `content: "none"` (it holds no BlockNote
 * inline children), so it can't host editable BlockNote text directly. The
 * editable affordance is therefore a React-controlled <input> rendered inside
 * the node. We DO NOT mutate BlockNote props on every keystroke (that would
 * churn the document + onChange). Instead the live typed text lives in local
 * React state; only on submit do we persist it onto the node's `prompt` prop
 * and flip `status`. The submit itself is delegated to a parent-provided
 * callback through `JarvisPillContext`, because `createReactInlineContentSpec`'s
 * render can't take arbitrary props.
 *
 * EXPORT EXCLUSION (JDOC-UX-06): this is `content: "none"`, so BlockNote's
 * markdown mirror emits nothing for it — receipts never reach the markdown that
 * exports read. As defense-in-depth the editor's onChange also runs the mirror
 * through stripReceipts. The in-doc hide toggle is pure CSS (a data attribute on
 * the editor wrapper), independent of export.
 */

import { createReactInlineContentSpec } from "@blocknote/react";
import { Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

import { receiptToMarkdownComment } from "@/lib/jarvis/receipt-markdown";

/** The persisted prop schema for the pill. All BlockNote props are strings. */
export const JARVIS_RECEIPT_TYPE = "jarvisReceipt" as const;

// Re-export the pure markdown contract so callers can import it alongside the
// spec; the implementation lives in lib/jarvis/receipt-markdown.ts (testable).
export { receiptToMarkdownComment };

/**
 * The submit seam the editor wires up. The pill's editable <input> hands its
 * typed text here on Cmd/Ctrl+Enter; PageBlockEditor identifies the pill node
 * (by the props identity it received in render) and runs the JARVIS turn,
 * flipping the node's status to loading then receipt/error.
 *
 * `submitPill(prompt, propsRef)` returns once the turn is dispatched (it does
 * NOT block on the network — the editor flips the node to "loading" itself).
 */
export interface JarvisPillContextValue {
  /**
   * Submit a freshly-typed prompt for the given pill node. The editor locates
   * the node carrying `nodeProps` and drives the loading -> receipt/error
   * transition. No-op when the prompt has no body.
   */
  submit: (prompt: string, nodeProps: JarvisPillProps) => void;
}

/** The pill's persisted props (mirror of the propSchema below). */
export interface JarvisPillProps {
  prompt: string;
  status: string;
  summary: string;
  turnId: string;
}

const JarvisPillContext = createContext<JarvisPillContextValue | null>(null);

export function JarvisPillProvider({
  value,
  children,
}: {
  value: JarvisPillContextValue;
  children: React.ReactNode;
}) {
  return (
    <JarvisPillContext.Provider value={value}>
      {children}
    </JarvisPillContext.Provider>
  );
}

/**
 * The editable prompt input shown while status === "prompt". Keeps the typed
 * text in local state (no per-keystroke BlockNote churn); autofocuses on mount
 * so invoking JARVIS lands the cursor INSIDE the pill. All key events are
 * stopped from propagating so BlockNote never sees them — crucially Enter
 * (no split) and Cmd/Ctrl+Enter (our submit, not BlockNote's).
 */
function JarvisPromptInput({ nodeProps }: { nodeProps: JarvisPillProps }) {
  const ctx = useContext(JarvisPillContext);
  // Seed from any persisted prompt (e.g. a reloaded, never-submitted pill).
  const [value, setValue] = useState(nodeProps.prompt ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Move focus INTO the pill the moment it's inserted (JDOC-UX: type in pill).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // rAF so BlockNote finishes its own focus/selection work first, otherwise
    // the editor steals focus back right after insertion.
    const id = requestAnimationFrame(() => {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function trySubmit() {
    if (value.trim().length === 0) return;
    ctx?.submit(value, nodeProps);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      // contentEditable={false} on the wrapper keeps BlockNote from treating
      // the pill region as editable text; the input is the only editable bit.
      className="bn-jarvis-pill-input"
      value={value}
      placeholder="Ask JARVIS…"
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setValue(e.target.value)}
      // Stop EVERY key from reaching BlockNote so typing stays in the pill and
      // Enter never splits the block. Submit only on Cmd/Ctrl+Enter.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          trySubmit();
          return;
        }
        if (e.key === "Enter") {
          // Plain Enter must NOT split the paragraph and must NOT submit.
          e.preventDefault();
        }
      }}
      // Don't let clicks/selection bubble into BlockNote's selection handling.
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

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
      const nodeProps = props.inlineContent.props as JarvisPillProps;
      const { prompt, status, summary } = nodeProps;

      const isReceipt = status === "receipt";
      const isError = status === "error";
      const isLoading = status === "loading";
      const isPrompt = status === "prompt";

      // Receipt + error states show the resolved line; hovering reveals the
      // original prompt (JDOC-UX-04). Loading shows the prompt being processed.
      const label = isReceipt
        ? summary || "No changes"
        : isError
          ? summary || "JARVIS failed"
          : prompt || "@Jarvis";

      return (
        <span
          className="bn-jarvis-pill"
          data-status={status}
          // Hover tooltip with the original prompt on resolved/loading pills.
          // `data-prompt` drives the styled CSS tooltip (page-block-editor.css);
          // `title` is the accessible/native fallback.
          data-prompt={isReceipt || isError || isLoading ? prompt || undefined : undefined}
          title={isReceipt || isError || isLoading ? prompt : undefined}
          contentEditable={false}
        >
          <span className="bn-jarvis-pill-icon" aria-hidden="true">
            {isLoading ? (
              <Loader2 size={12} strokeWidth={2} className="bn-jarvis-spin" />
            ) : (
              <KiwiIcon size={12} />
            )}
          </span>
          {isPrompt ? (
            <JarvisPromptInput nodeProps={nodeProps} />
          ) : (
            <span className="bn-jarvis-pill-label">{label}</span>
          )}
        </span>
      );
    },
  },
);
