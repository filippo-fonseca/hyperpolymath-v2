// Phase 5.1 (D-A1 / JARVIS-19) — ask_clarification tool.
//
// The fifth JARVIS tool. Emits an INLINE QUESTION instead of an action when
// confidence is medium-low AND capture-first would lose clearly-intended
// specific information. Strict adversarial defense (D-A4): never the
// default fallback — capture-first remains default per JARVIS-06.
//
// The reply submits as the next user turn prefixed `[CLARIFICATION REPLY]`.
// Depth capped at 1 per turn server-side (Pitfall 2). Question content is
// never persisted — lives in scrollback only.

import { z } from "zod";

export function zAskClarificationFor(_opts: { voiceActive?: boolean }) {
  return z.object({
    question: z.string().min(1).max(300),
    // Array `.max()` is intentionally omitted — Anthropic's strict tool use
    // rejects JSON Schema `maxItems` on array properties. The "≤5 chips"
    // constraint is enforced via TOOL_USE_RULES copy in personality.ts and
    // truncated in the UI; this Zod shape only validates element types.
    options: z.array(z.string().min(1).max(80)).optional(),
    // `suggested_action` is a model hint about the action it WOULD take if
    // the user confirms. We only persist the tool name — the freeform `args`
    // record was removed because Anthropic strict tool use rejects JSON Schema
    // `additionalProperties: <object>` (it requires `false`). The model can
    // describe the args in the question text; full pre-fill can come back as
    // a strict union later if/when the chip UI consumes it.
    suggested_action: z
      .object({
        tool: z.enum(["create_task", "create_capture", "create_event"]),
      })
      .optional(),
  });
}

export const zAskClarification = zAskClarificationFor({ voiceActive: false });
export type AskClarificationAction = z.infer<typeof zAskClarification>;
