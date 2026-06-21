/**
 * Thin client invoker for in-document @JARVIS (Phase 31).
 *
 * Ties resolve -> serialize -> POST -> parse SSE into one framework-agnostic
 * call. This is the SEAM Phase 32 renders the inline pill / autocomplete /
 * receipt UI on top of — there is deliberately NO React or UI here.
 *
 * Flow:
 *   resolveScope(editor.document, cursorBlockId, prompt)
 *     -> serializePageContext(editor, scope)
 *     -> POST /api/jarvis/in-document
 *     -> parse the SSE stream (text/action/done/error)
 *     -> resolve { turnId, text, actions } on `done` (reject on `error`).
 */

import {
  resolveScope,
  type ResolverBlock,
  type ScopeKind,
  type ScopeTarget,
} from "@/lib/jarvis/scope-resolver";
import {
  serializePageContext,
} from "@/lib/jarvis/serialize-page-context";

/** Minimal live-editor surface this invoker needs (BlockNote satisfies it). */
type InvokeEditor = {
  document: ResolverBlock[];
  blocksToMarkdownLossy: (blocks: unknown[]) => Promise<string> | string;
};

export interface InDocumentAction {
  toolUseId: string;
  name: string;
  result: unknown;
}

export interface InDocumentResult {
  turnId: string;
  text: string;
  actions: InDocumentAction[];
}

export interface InvokeInDocumentArgs {
  editor: InvokeEditor;
  cursorBlockId: string | null;
  prompt: string;
  pageId: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Streaming text deltas as they arrive. */
  onTextDelta?: (delta: string) => void;
  /** Each executed action receipt as it arrives. */
  onAction?: (action: InDocumentAction) => void;
  /**
   * Force a specific scope, skipping smart inference (Phase 30). Used by the
   * Daily Page "process this page" button to deterministically run the WHOLE
   * page through the engine regardless of cursor position. When omitted, the
   * scope is inferred from cursorBlockId + prompt as before.
   */
  scopeOverride?: ScopeKind;
  /** Override the fetch endpoint (testing). */
  endpoint?: string;
  /** AbortSignal to cancel the in-flight request. */
  signal?: AbortSignal;
}

/**
 * Build a concrete scope target for an explicit override (Phase 30). For
 * "page" this is every top-level block (deterministic, cursor-independent).
 * For the anchored kinds we defer to resolveScope so the override still picks
 * the correct block/section relative to the cursor; if that resolution can't
 * honor the requested kind (e.g. no cursor), it falls back to whatever
 * resolveScope returns, which is always a valid non-empty target.
 */
function buildOverrideTarget(
  document: ResolverBlock[],
  cursorBlockId: string | null,
  kind: ScopeKind,
): ScopeTarget {
  if (kind === "page") {
    return { kind: "page", blockIds: document.map((b) => b.id) };
  }
  return resolveScope(document, cursorBlockId);
}

/** Parse a single SSE record ("event: x\ndata: {...}") into { event, data }. */
function parseSseRecord(record: string): { event: string; data: unknown } | null {
  const lines = record.split("\n").filter(Boolean);
  let event = "message";
  let rawData: string | undefined;
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) rawData = line.slice(5).trim();
  }
  if (rawData === undefined) return null;
  let data: unknown = rawData;
  try {
    data = JSON.parse(rawData);
  } catch {
    /* leave as raw string */
  }
  return { event, data };
}

/**
 * Run an in-document @JARVIS invocation. Composes scope resolution, whole-page
 * serialization, the POST, and SSE parsing. Resolves with the accumulated turn.
 */
export async function invokeInDocumentJarvis(
  args: InvokeInDocumentArgs,
): Promise<InDocumentResult> {
  const scope = args.scopeOverride
    ? buildOverrideTarget(args.editor.document, args.cursorBlockId, args.scopeOverride)
    : resolveScope(args.editor.document, args.cursorBlockId, args.prompt);
  const { targetMarkdown, pageMarkdown } = await serializePageContext(
    args.editor,
    scope,
  );

  const res = await fetch(args.endpoint ?? "/api/jarvis/in-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: args.prompt,
      scope: { kind: scope.kind },
      targetContext: targetMarkdown,
      pageContext: pageMarkdown,
      pageId: args.pageId,
      history: args.history ?? [],
    }),
    signal: args.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `in-document invocation failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let turnId = "";
  let text = "";
  const actions: InDocumentAction[] = [];
  let errorMessage: string | null = null;
  let done = false;

  const handle = (event: string, data: unknown) => {
    switch (event) {
      case "turn-start":
        turnId = (data as { turnId?: string }).turnId ?? turnId;
        break;
      case "text": {
        const delta = (data as { delta?: string }).delta ?? "";
        text += delta;
        if (delta) args.onTextDelta?.(delta);
        break;
      }
      case "action": {
        const a = data as { toolUseId?: string; name?: string; result?: unknown };
        const action: InDocumentAction = {
          toolUseId: a.toolUseId ?? "",
          name: a.name ?? "",
          result: a.result,
        };
        actions.push(action);
        args.onAction?.(action);
        break;
      }
      case "done":
        done = true;
        break;
      case "error":
        errorMessage = (data as { message?: string }).message ?? "Unknown error";
        done = true;
        break;
      // "queued" / "clarification" are surfaced to Phase 32's UI later; the
      // thin invoker ignores them for the resolved result.
      default:
        break;
    }
  };

  for (;;) {
    const { done: streamDone, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const records = buffer.split("\n\n");
    buffer = records.pop() ?? "";
    for (const record of records) {
      if (!record.trim()) continue;
      const parsed = parseSseRecord(record);
      if (parsed) handle(parsed.event, parsed.data);
    }
    if (streamDone) break;
    if (done) {
      // Drain the rest so the connection closes cleanly.
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  if (errorMessage !== null) {
    throw new Error(errorMessage);
  }

  return { turnId, text, actions };
}
