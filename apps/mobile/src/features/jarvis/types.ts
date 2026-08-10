// Turn model for the JARVIS transcript. Kept deliberately flat: the
// streaming turn's live text does NOT live here (see stream-store.ts) so the
// turns array — and therefore every memoized row — stays referentially
// stable while tokens flow.

export interface ReceiptAction {
  toolUseId: string;
  name: string;
  result: unknown;
  /** Locally undone via the 5s window — renders as a tombstone. */
  undone?: boolean;
}

export type AssistantTurnStatus = "pending" | "streaming" | "done" | "error";

export interface JarvisTurn {
  /** Server turnId for assistant turns; a local id for user turns. */
  id: string;
  role: "user" | "assistant";
  /** Final text. Empty while an assistant turn is streaming. */
  text: string;
  at: number;
  /** Assistant turns only. */
  status?: AssistantTurnStatus;
  actions?: ReceiptAction[];
  error?: string | null;
  /** User voice turns awaiting the canonical server transcript. */
  provisional?: boolean;
}

export interface ActionResult {
  ok?: boolean;
  id?: string;
  error?: string;
  receipt?: Record<string, unknown>;
}

export function actionResult(action: ReceiptAction): ActionResult {
  return (action.result ?? {}) as ActionResult;
}
