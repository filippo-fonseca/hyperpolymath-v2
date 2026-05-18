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
    options: z.array(z.string().min(1).max(80)).max(5, "Maximum 5 chip options").optional(),
    suggested_action: z
      .object({
        tool: z.enum(["create_task", "create_capture", "create_event"]),
        args: z.record(z.string(), z.unknown()),
      })
      .optional(),
  });
}

export const zAskClarification = zAskClarificationFor({ voiceActive: false });
export type AskClarificationAction = z.infer<typeof zAskClarification>;
