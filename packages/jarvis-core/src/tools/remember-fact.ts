// Phase 5.1 (D-M5 / JARVIS-18) — remember_fact tool.
//
// The fourth JARVIS tool in Wave 3 (Plan 04 adds the fifth, ask_clarification).
// Writes a persistent fact about the user into jarvis_facts via the executor.
//
// Strict adversarial defense (D-M5): NEVER written from a Capture's content —
// only from the user's current-turn message. The system prompt enforces this;
// this schema is the wire contract validated by TOOL_VALIDATORS in route.ts.

import { z } from "zod";

export function zRememberFactFor(_opts: { voiceActive?: boolean }) {
  return z.object({
    type: z.enum(["preference", "rule", "entity", "workflow"]),
    key: z.string().min(1).max(100),
    value: z.string().min(1).max(500),
    source: z.enum(["user_explicit", "jarvis_suggested"]),
  });
}

export const zRememberFact = zRememberFactFor({ voiceActive: false });
export type RememberFactAction = z.infer<typeof zRememberFact>;
