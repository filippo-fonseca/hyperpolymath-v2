// Zod schema for `create_capture` tool (D-08).
// Capture-first fallback action — least-structured of the three tools.

import { z } from "zod";

export function zCreateCaptureFor(opts: { voiceActive?: boolean }) {
  return z.object({
    content: z.string().min(1).max(10_000),
    hashtags: z.array(z.string().min(1).max(64)).optional(),
    project_ids: z.array(z.uuid()).optional(),
    // voice_summary REQUIRED when voiceActive — see create-task.ts for rationale.
    ...(opts.voiceActive
      ? { voice_summary: z.string().min(1).max(200) }
      : {}),
  });
}

export const zCreateCapture = zCreateCaptureFor({ voiceActive: false });
