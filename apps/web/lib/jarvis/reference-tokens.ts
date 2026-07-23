/**
 * Canonical reference tokens for JARVIS tool results.
 *
 * When a find/create tool hands an entity back to the model, it attaches the
 * exact S1 token string the model should echo if it names that entity in its
 * reply — so the transcript renders a live pill instead of bare prose. The
 * model is told (in the prompt guidance) to copy these verbatim and never to
 * synthesize a token from a raw id.
 *
 * Thin wrappers over `serializeReference` so the grammar stays single-sourced
 * in lib/references/token.ts: there is no second place that assembles the
 * `@[label](ref://type/uuid)` string. Captures have no title, so their token
 * label is the same synthesized first line every other capture chip uses.
 */

import {
  captureLabel,
  serializeReference,
} from "@/lib/references/token";

/** The S1 token for a task, labelled by its title. */
export function taskRefToken(id: string, title: string): string {
  return serializeReference({ type: "task", id, label: title });
}

/** The S1 token for a capture, labelled by its synthesized first line. */
export function captureRefToken(id: string, content: string): string {
  return serializeReference({
    type: "capture",
    id,
    label: captureLabel(content),
  });
}

/** The S1 token for a person, labelled by name. */
export function personRefToken(id: string, name: string): string {
  return serializeReference({ type: "person", id, label: name });
}
